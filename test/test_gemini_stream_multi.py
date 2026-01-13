import google.genai as genai
from google.genai import types as genai_types
import asyncio
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

async def main():
    client = genai.Client(api_key=Google_API_KEY)
    
    async def _gemini_upload_file(client: genai.Client, file_path: str) -> object:
        return await client.aio.files.upload(file=file_path)

    async def _wait_for_files_active(client: genai.Client, files: list):
        print("Checking file processing status...")
        for file_obj in files:
            # 图片通常不需要等待，但 PDF/视频 需要
            # 持续轮询直到状态变为 ACTIVE
            while True:
                # 重新从服务器获取最新的文件信息
                remote_file = await client.aio.files.get(name=file_obj.name)
                
                if remote_file.state == "ACTIVE":
                    print(f"File {remote_file.name} is ready.")
                    break
                elif remote_file.state == "FAILED":
                    raise ValueError(f"File {remote_file.name} failed to process.")
                else:
                    print(f"File {remote_file.name} is processing... waiting 2s")
                    await asyncio.sleep(0.5) # 非阻塞等待

    image_gemini = await _gemini_upload_file(client, IMAGE_PATH)
    file_gemini = await _gemini_upload_file(client, PDF_PATH)

    await _wait_for_files_active(client, [image_gemini, file_gemini])

    kwargs: dict = {
        "model": "gemini-3-flash-preview", # "gemini-3-pro-preview"
        "config": genai_types.GenerateContentConfig(
            # Gemini 3 Pro: low | high
            # Gemini 3 Flash: minimum | low | medium | high
            thinking_config=genai_types.ThinkingConfig(thinking_level="low",include_thoughts=True),
            system_instruction="You are a helpful assistant."
        ),
    }

    thoughts = ""
    answer = ""
    final_chunk = None
    chat = client.aio.chats.create(**kwargs)
    stream1 = await chat.send_message_stream(
            message=[
                    genai_types.Part(text="What is in the image and the pdf? Please describe it in concise way"),
                    genai_types.Part(file_data=genai_types.FileData(file_uri=image_gemini.uri, mime_type=image_gemini.mime_type)),
                    genai_types.Part(file_data=genai_types.FileData(file_uri=file_gemini.uri, mime_type=file_gemini.mime_type)),
                ]
            )
    with open("gemini_stream_multi_1.txt", "w") as f:
        async for chunk in stream1:
            final_chunk = chunk
            for part in chunk.candidates[0].content.parts:
                if not part.text:
                    continue
                elif part.thought:
                    if not thoughts:
                        print("Thoughts summary 1:")
                        f.write("Thoughts summary 1:\n")
                    print(part.text)
                    f.write(part.text)
                    thoughts += part.text
                else:
                    if not answer:
                        print("Answer 1:")
                        f.write("Answer 1:\n")
                    print(part.text)
                    f.write(part.text)
                    answer += part.text
    
    if final_chunk:
        usage = {
            "input_tokens": final_chunk.usage_metadata.prompt_token_count,
            "output_tokens": final_chunk.usage_metadata.candidates_token_count,
            "reasoning_tokens": final_chunk.usage_metadata.thoughts_token_count,
            "total_tokens": final_chunk.usage_metadata.total_token_count,
        }
        print("usage 1:", usage)

    thoughts = ""
    answer = ""
    final_chunk = None
    stream2 = await chat.send_message_stream(
                message=[
                    genai_types.Part(text="Please describe yourself in concise way")
                ]
            )
    with open("gemini_stream_multi_2.txt", "w") as f:
        async for chunk in stream2:
            final_chunk = chunk
            for part in chunk.candidates[0].content.parts:
                if not part.text:
                    continue
                elif part.thought:
                    if not thoughts:
                        print("Thoughts summary 2:")
                        f.write("Thoughts summary 2:\n")
                    print(part.text)
                    f.write(part.text)
                    thoughts += part.text
                else:
                    if not answer:
                        print("Answer 2:")
                        f.write("Answer 2:\n")
                    print(part.text)
                    f.write(part.text)
                    answer += part.text
    
    if final_chunk:
        usage = {
            "input_tokens": final_chunk.usage_metadata.prompt_token_count,
            "output_tokens": final_chunk.usage_metadata.candidates_token_count,
            "reasoning_tokens": final_chunk.usage_metadata.thoughts_token_count,
            "total_tokens": final_chunk.usage_metadata.total_token_count,
        }
        print("usage 2:", usage)
    
asyncio.run(main())