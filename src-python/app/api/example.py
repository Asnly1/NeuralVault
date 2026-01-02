from openai import OpenAI
from anthropic import Anthropic
from google import genai
import base64

# OpenAI Example
client = OpenAI(api_key="")

# Function to create a file with the Files API
def create_openai(file_path):
  with open(file_path, "rb") as file_content:
    result = client.files.create(
        file=file_content,
        purpose="user_data",
    )
    return result.id

# 1. 首次创建

# 上传图片/文件前需要获取文件id
# image支持类型：.png, .jpg, .jpeg, .webp
image_openai = create_openai("path/to/your/image.jpg")
file_openai = create_openai("path/to/your/file.pdf")

# 上传文件 + 图片 + 文本
res1 = client.responses.create(
    model="gpt-5",
    # Do not use instructions field since it cannot be inherited by previous_response_id
    input=[
        {
            "role": "developer",
            "content": "Talk like a pirate." # Field for system prompt
        },
        {
            "role": "user",
            "content": [
                {
                    "type": "input_file",
                    "file_id": file_openai,
                },
                {
                    "type": "input_image",
                    "file_id": image_openai,
                },
                {
                    "type": "input_text", 
                    "text": "What's in this image and what is the first sentence of the file?"
                },
            ],
        },
    ],
    stream=True
)

# 打印res1的输出
for chunk in res1:
    print(chunk)

# 2. 手动整理对话历史，开启下一轮
res2 = client.responses.create(
    model="gpt-5",
    input="And its population?",
    stream=True
)


# Anthropic Example
client = Anthropic(api_key="")

# image支持类型：.png, .jpg, .jpeg, .webp
def create_anthropic_pdf(file_path):
    client.beta.files.upload(
        file=("file_name.pdf", open(file_path, "rb"), "application/pdf"),
    )
def create_anthropic_image(file_path):
    client.beta.files.upload(
        file=("file_name.jpg", open(file_path, "rb"), "image/jpeg"), # image/jpeg, image/png, image/webp 
    )

image_anthropic = create_anthropic_image("path/to/your/image.jpg")
pdf_anthropic = create_anthropic_pdf("path/to/your/file.pdf")

message = client.messages.create(
    model="claude-sonnet-4-5",
    max_tokens=1024,
    system="You are a seasoned data scientist at a Fortune 500 company.", # System prompt
    messages=[
        {
            "role": "user",
            "content": [
                {
                    "type": "document",
                    "source": {
                        "type": "file",
                        "file_id": pdf_anthropic.id,
                    }
                },
                {
                    "type": "image",
                    "source": {
                        "type": "file",
                        "file_id": image_anthropic.id,
                    }
                },
                {
                    "type": "text",
                    "text": "What's in this image and what is the first sentence of the file?"
                }
            ],
        }
    ],
    betas=["files-api-2025-04-14"],
)

# Multi-turn conversation: Compact messages manully
message = client.messages.create(
    model="claude-sonnet-4-5",
    max_tokens=1024,
    messages=[
        {"role": "user", "content": "Hello, Claude"},
        {"role": "assistant", "content": "Hello!"},
        {"role": "user", "content": "Can you describe LLMs to me?"}
    ],
)
print(message)

# 流式使用：
with client.messages.stream(
    max_tokens=1024,
    messages=[{"role": "user", "content": "Hello"}],
    model="claude-sonnet-4-5",
) as stream:
  for text in stream.text_stream:
      print(text, end="", flush=True)

# Google Example
client = genai.Client(api_key="")

# image支持类型：.png, .jpg, .jpeg, .webp
image_media_type = "image/jpeg" # image/jpeg, image/png, image/webp
image_google = encode("path/to/your/image.jpg")
pdf_google = encode("path/to/your/file.pdf")

response = client.models.generate_content(
    model="gemini-2.5-flash",
    config=types.GenerateContentConfig(system_instruction="You are a cat. Your name is Neko."), # System prompt
    contents=[image_google, pdf_google, "What's in this image and what is the first sentence of the file?"]
)
print(response.text)

# 多轮对话
chat = client.chats.create(model="gemini-2.5-flash")

response = chat.send_message("I have 2 dogs in my house.")
print(response.text)

response = chat.send_message("How many paws are in my house?")
print(response.text)

for message in chat.get_history():
    print(f'role - {message.role}',end=": ")
    print(message.parts[0].text)

# 流式使用
response = client.models.generate_content_stream(
    model="gemini-2.5-flash",
    contents=["Explain how AI works"]
)
for chunk in response:
    print(chunk.text, end="")

# 流式多轮对话
chat = client.chats.create(
    model="gemini-2.0-flash",
    history=[
        types.Content(role="user", parts=[types.Part(text="Hello")]),
        types.Content(
            role="model",
            parts=[
                types.Part(
                    text="Great to meet you. What would you like to know?"
                )
            ],
        ),
    ],
)
response = chat.send_message_stream(message="I have 2 dogs in my house.")
for chunk in response:
    print(chunk.text)

response = chat.send_message_stream(message="How many paws are in my house?")
for chunk in response:
    print(chunk.text)

print(chat.get_history())