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

    anthropic_messages: list[dict] = []
    anthropic_messages.append(
        {
            "role": "user",
            "content": [
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

    response = await client.beta.messages.create(**kwargs)
    with open("anthropic_reasoning_1.txt", "w", encoding="utf-8") as f:
        print("Thinking:")
        print(response.content[0].thinking)
        f.write(response.content[0].thinking)
        print("Text:")
        print(response.content[1].text)
        f.write(response.content[1].text)

        usage = response.usage
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

asyncio.run(main())