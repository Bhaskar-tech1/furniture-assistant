import os
import cv2
import numpy as np
import base64
import json
import io
from huggingface_hub import InferenceClient
from flask import Flask, request, jsonify
from flask_cors import CORS
from groq import Groq
from dotenv import load_dotenv

# Load env vars
load_dotenv()

app = Flask(__name__)
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
    
    # 2. Construct Dynamic Prompt
    prompt_text = (
        f"You are a highly acclaimed professional interior designer. "
        f"We used a computer vision algorithm on the user's room image, which detected a dominant color theme of {dominant_color}. "
        f"The room is intended to be a {room_type}. The preferred overall design style is {preferred_style}. "
        f"The user has the following custom details/constraints: {custom_instructions}. "
        "Provide 3-4 matching furniture or decor pieces that fit these exact specs. Each item MUST be highly practical. "
        "Also provide a well-written, overarching style description explaining *why* your curated items match the room. "
        "IMPORTANT: You must suggest a specific, distinct color hex for each item that fits the color palette perfectly. "
        "Return your response strictly as valid JSON with NO markdown blocks and containing precisely this structure:\n"
        "{\"style_description\": \"...\", \"items\": [{\"name\": \"...\", \"description\": \"...\", \"reason\": \"...\", \"suggested_color_hex\": \"#HEXCODE\"}]}"
    )

    try:
        chat_completion = client.chat.completions.create(
            messages=[{
                "role": "user",
                "content": prompt_text
            }],
            model="llama-3.3-70b-versatile",
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
            model="llama-3.3-70b-versatile",
            temperature=0.6,
            max_tokens=512
        )
        reply = chat_completion.choices[0].message.content
        return jsonify({'reply': reply}), 200
    except Exception as e:
        print(f"Chat endpoint error: {e}")
        return jsonify({'error': 'Failed to get a response'}), 500


@app.route('/generate-image', methods=['GET'])
def generate_image():
    prompt = request.args.get('prompt')
    if not prompt:
        return "Prompt missing", 400
        
    try:
        client = InferenceClient(api_key=os.environ.get('HF_API_KEY'))
        # Using FLUX.1-schnell - currently one of the fastest free models
        image = client.text_to_image(prompt, model="black-forest-labs/FLUX.1-schnell")
        
        img_byte_arr = io.BytesIO()
        image.save(img_byte_arr, format='JPEG')
        img_byte_arr.seek(0)
        
        return img_byte_arr.read(), 200, {'Content-Type': 'image/jpeg'}
    except Exception as e:
        print(f"HF Inference Error: {str(e)}")
        return "Failed", 500

if __name__ == '__main__':
    app.run(debug=True, port=5001)
