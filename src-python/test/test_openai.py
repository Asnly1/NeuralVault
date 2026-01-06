import openai
import asyncio
import json

OPENAI_API_KEY = "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"
ANTHROPIC_API_KEY = "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"
Google_API_KEY = "AIzaSyBi7sOc_tg_GN1tT8D9JeR1GmvFp_WxLnI"
Grok_API_KEY = "xai-3uR94lQsLj9qBcRefmqODQW9mTFLkeQpIuaD9dKf0cPhJHcpapavTQhKK4odvAvu26c8LBmCMcOJ4iUe"
DeepSeek_API_KEY = "sk-71ea09da50864295b63a27bf24108cf3"
Qwen_API_KEY = "sk-65be7c5ae2e74265826b0cfd8dfef4fd"
IMAGE_PATH = "/Users/hovsco/Desktop/test_image.png"
PDF_PATH = "/Users/hovsco/Desktop/test_pdf.pdf"

async def main():
    client = openai.AsyncOpenAI(api_key=OPENAI_API_KEY)

    async def _openai_upload_file(
        client: openai.AsyncOpenAI,
        file_path: str,
    ) -> str:
        with open(file_path, "rb") as f:
            result = await client.files.create(file=f, purpose="user_data")
        return result.id

    image_openai = await _openai_upload_file(client, IMAGE_PATH)
    file_openai = await _openai_upload_file(client, PDF_PATH)

    input_items: list[dict] = []

    input_items.append({"role": "developer", "content": "You are a helpful assistant. Please answer in concise tone."})

    content_items: list[dict] = []
    content_items.append({"type": "input_image", "file_id": image_openai})
    content_items.append({"type": "input_file", "file_id": file_openai})
    content_items.append({"type": "input_text", "text": "What's in this image and the file? Please answer in concise tone."})

    input_items.append(
        {
            "role": "user",
            "content": content_items,
        }
    )

    payload: dict = {
        "model": "gpt-5.2-2025-12-11",
        "input": input_items,
        "reasoning": {
            "effort": "medium" # "none", "low", "medium", "high"
        }
    }

    response = await client.responses.create(**payload)
    with open("openai_reasoning_1.txt", "w", encoding="utf-8") as f:
        print(response.output_text)
        f.write(response.output_text)

        reasoning_tokens = getattr(response, "usage.output_tokens_details.reasoning_tokens", 0) or 0
        usage = {
            "input_tokens": response.usage.input_tokens,
            "output_tokens": response.usage.output_tokens,
            "reasoning_tokens": reasoning_tokens,
            "total_tokens": response.usage.total_tokens + reasoning_tokens,
        }
        if usage:
            print("type: usage", "usage:", usage)
            f.write("\n")
            f.write(json.dumps(usage))
        

asyncio.run(main())