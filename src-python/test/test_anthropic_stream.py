import asyncio
import anthropic
import base64
import os
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
    client = anthropic.AsyncAnthropic(api_key=ANTHROPIC_API_KEY)

    async def _anthropic_upload_file(
        client: anthropic.AsyncAnthropic,
        file_path: str,
    ) -> str:
        filename = os.path.basename(file_path)
        name, ext = os.path.splitext(filename)
        if ext == ".pdf":
            file_type_string = "application/pdf"
        with open(file_path, "rb") as f:
            result = await client.beta.files.upload(file=(name, f, file_type_string))
        return result.id
    
    async def _anthropic_encode_image(
        file_path: str
    ) -> tuple[str, str] :
        filename = os.path.basename(file_path)
        name, ext = os.path.splitext(filename)
        if ext == ".png":
            file_type_string = "image/png"
        elif ext == ".jpg":
            file_type_string = "image/jpeg"
        elif ext == ".jpeg":
            file_type_string = "image/jpeg"
        elif ext == ".webp":
            file_type_string = "image/webp"

        with open(file_path, "rb") as f:
            return base64.standard_b64encode(f.read()).decode("utf-8"), file_type_string

    image_anthropic, image_type = await _anthropic_encode_image(IMAGE_PATH)
    file_anthropic = await _anthropic_upload_file(client, PDF_PATH)

    anthropic_messages: list[dict] = []
    anthropic_messages.append(
        {
            "role": "user",
            "content": [
                # {"type": "image", "source": {"type": "base64", "media_type": image_type, "data": image_anthropic}},
                # {"type": "document", "source": {"type": "file", "file_id": file_anthropic}},
                {"type": "text", "text": "Please describe yourself."}
            ]
        }
    )

    kwargs: dict = {
        "model": "claude-haiku-4-5-20251001",
        "max_tokens": 4096,
        "betas": ["files-api-2025-04-14"],
        "messages": anthropic_messages,
        "thinking": {
            "type": "enabled",
            "budget_tokens": 1024
        },
    }
    kwargs["system"] = "You are a helpful assistant. Please answer in concise tone."

    with open("anthropic_stream_reasoning_1.txt", "w", encoding="utf-8") as f:
        async with client.beta.messages.stream(**kwargs) as stream:
            async for event in stream:
                event_type = event.type
                if event_type == "content_block_delta":
                    if event.delta.type == "thinking_delta":
                        delta = event.delta.thinking
                        if delta:
                            f.write(delta)
                            f.flush()
                            print("type: thinking_delta", "delta: ", delta)
                    elif event.delta.type == "text_delta":
                        delta = event.delta.text
                        if delta:
                            f.write(delta)
                            f.flush()
                            print("type: text_delta", "delta: ", delta)
                elif event_type == "content_block_stop":
                    if event.content_block.type == "thinking":
                        done_text = event.content_block.thinking
                        if done_text:
                            f.write("\n")
                            f.write(done_text)
                            f.flush()
                            print("type: thinking_done_text", "done_text: ", done_text)
                    elif event.content_block.type == "text":
                        done_text = event.content_block.text
                        if done_text:
                            f.write("\n")
                            f.write(done_text)
                            f.flush()
                            print("type: text_done_text", "done_text: ", done_text)
                elif event_type == "message_stop":
                    usage = event.message.usage
                    reasoning_tokens = getattr(usage, "reasoning_tokens", 0) or 0
                    usage_dict = {
                        "input_tokens": usage.input_tokens,
                        "output_tokens": usage.output_tokens,
                        "reasoning_tokens": reasoning_tokens,
                        "total_tokens": usage.input_tokens + usage.output_tokens + reasoning_tokens,
                    }
                    if usage:
                        f.write("\n")
                        f.write(str(usage_dict))
                        f.flush()
                        print("type: usage", "usage: ", usage_dict)
                else:
                    continue

asyncio.run(main())