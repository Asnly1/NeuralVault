from openai import OpenAI
from anthropic import Anthropic
from google import genai
from google.genai import types as genai_types
import json
import base64

OPENAI_API_KEY = "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"
ANTHROPIC_API_KEY = "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"
Google_API_KEY = "AIzaSyBi7sOc_tg_GN1tT8D9JeR1GmvFp_WxLnI"
Grok_API_KEY = "xai-3uR94lQsLj9qBcRefmqODQW9mTFLkeQpIuaD9dKf0cPhJHcpapavTQhKK4odvAvu26c8LBmCMcOJ4iUe"
DeepSeek_API_KEY = "sk-71ea09da50864295b63a27bf24108cf3"
Qwen_API_KEY = "sk-65be7c5ae2e74265826b0cfd8dfef4fd"
IMAGE_PATH = "/Users/hovsco/Desktop/test_image.png"
PDF_PATH = "/Users/hovsco/Desktop/test_pdf.pdf"

# ============================================================
# Google Example
# ============================================================
from xai_sdk import AsyncClient as GrokClient
from xai_sdk.chat import system as grok_system, user as grok_user, file as grok_file, image as grok_image
import asyncio

async def main():
    client = GrokClient(api_key=Grok_API_KEY)

    def encode_image(image_path):
        with open(image_path, "rb") as image_file:
            return base64.b64encode(image_file.read()).decode('utf-8')

    image_parts = []
    files_parts = []
    image_grok = encode_image(IMAGE_PATH)
    # pdf_grok = await client.files.upload(PDF_PATH)
    image_parts.append(grok_image(image_grok))
    print("image_grok", image_grok)
    # files_parts.append(grok_file(pdf_grok.id))

    res2 = client.chat.create(model="grok-4-1-fast-reasoning", store_messages=False)
    res2.append(grok_system("You are Grok, a chatbot inspired by the Hitchhiker's Guide to the Galaxy."))
    res2.append(grok_user("What's in this image? Please answer in concise tone.", grok_image("https://science.nasa.gov/wp-content/uploads/2023/09/web-first-images-release.png")))

    full_text = ""
    final_response = None
    with open("grok_stream_non_reasoning_1.txt", "w", encoding="utf-8") as f:
        async for response, chunk in res2.stream():
            final_response = response
            if chunk.content:
                print(f"type: delta, delta: {chunk.content}")
                full_text += chunk.content
                f.write(chunk.content)
                f.write("\n")
            
        print(f"type: done_text, done_text: {full_text}")
        usage = {
            "input_tokens": final_response.usage.prompt_tokens,
            "output_tokens": final_response.usage.completion_tokens,
            "resoning_tokens": final_response.usage.reasoning_tokens,
            "total_tokens": final_response.usage.total_tokens,
        }
        print(f"type: usage, usage: {usage}")
        f.write(full_text)
        f.write("\n")
        f.write(json.dumps(usage, ensure_ascii=False))

asyncio.run(main())