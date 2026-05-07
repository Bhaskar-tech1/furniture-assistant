import os
import cv2
import numpy as np
import base64
import json
import io

from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from groq import Groq
from dotenv import load_dotenv

# Load env vars
load_dotenv(override=True)

# Get absolute path to the frontend folder
frontend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'frontend'))

app = Flask(__name__, static_folder=frontend_dir, static_url_path='/')

@app.route('/')
def serve_index():
    return send_from_directory(app.static_folder, 'index.html')
CORS(app)  # enable CORS for frontend

# Initialize Groq client
client = Groq(api_key=os.environ.get("GROQ_API_KEY"))

def get_dominant_color(image_bytes, k=3):
    """
    Extract the dominant color from an image using KMeans clustering.
    """
    try:
        # Convert bytes to numpy array then to cv2 image
        nparr = np.frombuffer(image_bytes, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        
        if img is None:
            return None
            
        # Convert from BGR to RGB
        img = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
        
        # Reshape the image to be a list of pixels
        pixels = img.reshape((-1, 3))
        pixels = np.float32(pixels)
        
        # Define criteria, number of clusters(k) and apply kmeans()
        criteria = (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 100, 0.2)
        _, labels, centers = cv2.kmeans(pixels, k, None, criteria, 10, cv2.KMEANS_RANDOM_CENTERS)
        
        # Convert centers back to uint8
        centers = np.uint8(centers)
        
        # Find the most frequent cluster
        counts = np.bincount(labels.flatten())
        dominant_cluster = np.argmax(counts)
        dominant_color = centers[dominant_cluster]
        
        # Convert RGB to HEX
        hex_color = "#{:02x}{:02x}{:02x}".format(dominant_color[0], dominant_color[1], dominant_color[2])
        return hex_color
    except Exception as e:
        print(f"Error in image processing: {e}")
        return None


@app.route('/generate', methods=['POST'])
def generate_suggestions():
    # If Groq API key is missing, return mock data for local testing
    if not os.getenv("GROQ_API_KEY"):
        mock_response = {
            "dominant_color": "#ff5733",
            "style_description": "Modern minimalist style",
            "items": [
                {
                    "name": "Sleek Sofa",
                    "description": "A low-profile sofa with clean lines.",
                    "image_url": "https://images.unsplash.com/photo-1600585154340-be6161a56a0c",
                    "reason": "Matches modern aesthetic and color palette.",
                    "suggested_color_hex": "#ff5733"
                },
                {
                    "name": "Glass Coffee Table",
                    "description": "Transparent glass top with a metal frame.",
                    "image_url": "https://images.unsplash.com/photo-1582582494708-1bf916e710c2",
                    "reason": "Adds a light, airy feel.",
                    "suggested_color_hex": "#cccccc"
                },
                {
                    "name": "Accent Chair",
                    "description": "A vibrant accent chair for a pop of color.",
                    "image_url": "https://images.unsplash.com/photo-1582582425600-6f7d1e03bfe5",
                    "reason": "Provides contrast against the dominant hue.",
                    "suggested_color_hex": "#0044ff"
                },
                {
                    "name": "Floor Lamp",
                    "description": "Modern floor lamp with adjustable brightness.",
                    "image_url": "https://images.unsplash.com/photo-1519710164239-da123dc03ef4",
                    "reason": "Enhances lighting and complements style.",
                    "suggested_color_hex": "#ffffff"
                }
            ]
        }
        return jsonify(mock_response), 200
    if 'image' not in request.files:
        return jsonify({'error': 'No image uploaded'}), 400
        
    file = request.files['image']
    image_bytes = file.read()
    
    # Extract form data
    room_type = request.form.get('room_type', 'room')
    preferred_style = request.form.get('preferred_style', 'modern')
    custom_instructions = request.form.get('custom_instructions', 'None')
    
    # 1. Get dominant color for the UI & AI Context
    dominant_color = get_dominant_color(image_bytes) or "#000000"
    
    # Load dataset for prompt
    try:
        with open('furniture_dataset.json', 'r') as f:
            catalog = json.load(f)
    except Exception as e:
        print(f"Error loading catalog: {e}")
        catalog = []
        
    catalog_str = json.dumps(catalog)
    
    # 2. Construct Dynamic Prompt
    prompt_text = (
        f"You are a highly acclaimed professional interior designer. "
        f"We used a computer vision algorithm on the user's room image, which detected a dominant color theme of {dominant_color}. "
        f"The room is intended to be a {room_type}. The preferred overall design style is {preferred_style}. "
        f"The user has the following custom details/constraints: {custom_instructions}. "
        f"Here is our furniture catalog (JSON):\n{catalog_str}\n\n"
        "Select EXACTLY 4 items from the catalog that fit the room perfectly. "
        "IMPORTANT: You MUST use the exact 'name', 'description', and 'image_url' provided in the catalog for each selected item. "
        "Also provide a 'reason' why the item matches the room, and a 'suggested_color_hex' for it. "
        "Also provide an overarching 'style_description'. "
        "Return your response strictly as valid JSON with NO markdown blocks and containing precisely this structure:\n"
        "{\"style_description\": \"...\", \"items\": [{\"name\": \"...\", \"description\": \"...\", \"image_url\": \"...\", \"reason\": \"...\", \"suggested_color_hex\": \"#HEXCODE\"}]}"
    )

    try:
        chat_completion = client.chat.completions.create(
            messages=[{
                "role": "user",
                "content": prompt_text
            }],
            model="llama-3.1-8b-instant",
            temperature=0.4,
            response_format={"type": "json_object"}
        )
        response_text = chat_completion.choices[0].message.content
        
        # Merge dominant color into response so UI can use it
        payload = json.loads(response_text)
        payload['dominant_color'] = dominant_color
        
        return jsonify(payload), 200
    except Exception as e:
        print(f"Error from Groq API: {e}")
        return jsonify({'error': 'Failed to process AI vision request'}), 500

@app.route('/chat', methods=['POST'])
def chat():
    """
    Conversational chatbot endpoint for follow-up questions about furniture suggestions.
    Expects JSON: { "messages": [...], "context": { ... } }
    """
    data = request.get_json()
    if not data or 'messages' not in data:
        return jsonify({'error': 'No messages provided'}), 400

    user_messages = data['messages']  # list of { role, content }
    context = data.get('context', {})

    # Build a system prompt grounded in the furniture suggestion results
    system_prompt = (
        "You are a friendly, knowledgeable interior design assistant. "
        "The user has just received AI-generated furniture suggestions for their room. "
        "Your job is to answer any follow-up questions they have about the suggestions, "
        "provide alternatives, explain design choices, give shopping tips, or help with layout ideas. "
        "Be concise, helpful, and conversational. "
    )

    if context:
        system_prompt += f"\n\nHere is the context of the suggestions that were generated:\n"
        if context.get('style_description'):
            system_prompt += f"Style Overview: {context['style_description']}\n"
        if context.get('dominant_color'):
            system_prompt += f"Dominant Room Color: {context['dominant_color']}\n"
        if context.get('items'):
            system_prompt += "Suggested Items:\n"
            for i, item in enumerate(context['items'], 1):
                system_prompt += (
                    f"  {i}. {item.get('name', 'Unknown')} - {item.get('description', '')} "
                    f"(Color: {item.get('suggested_color_hex', 'N/A')}, "
                    f"Reason: {item.get('reason', '')})\n"
                )

    messages = [{"role": "system", "content": system_prompt}] + user_messages

    try:
        chat_completion = client.chat.completions.create(
            messages=messages,
            model="llama-3.1-8b-instant",
            temperature=0.6,
            max_tokens=512
        )
        reply = chat_completion.choices[0].message.content
        return jsonify({'reply': reply}), 200
    except Exception as e:
        print(f"Chat endpoint error: {e}")
        return jsonify({'error': 'Failed to get a response'}), 500



if __name__ == '__main__':
    app.run(debug=True, port=5001)
