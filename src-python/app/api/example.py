from openai import OpenAI
from anthropic import Anthropic
from google import genai
import base64

# ============================================================
# OpenAI Example
# ============================================================
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

# Response
# {
#   "id": "resp_67ccd2bed1ec8190b14f964abc0542670bb6a6b452d3795b",
#   "object": "response",
#   "created_at": 1741476542,
#   "status": "completed",
#   "error": null,
#   "incomplete_details": null,
#   "instructions": null,
#   "max_output_tokens": null,
#   "model": "gpt-4.1-2025-04-14",
#   "output": [
#     {
#       "type": "message",
#       "id": "msg_67ccd2bf17f0819081ff3bb2cf6508e60bb6a6b452d3795b",
#       "status": "completed",
#       "role": "assistant",
#       "content": [
#         {
#           "type": "output_text",
#           "text": "In a peaceful grove beneath a silver moon, a unicorn named Lumina discovered a hidden pool that reflected the stars. As she dipped her horn into the water, the pool began to shimmer, revealing a pathway to a magical realm of endless night skies. Filled with wonder, Lumina whispered a wish for all who dream to find their own hidden magic, and as she glanced back, her hoofprints sparkled like stardust.",
#           "annotations": []
#         }
#       ]
#     }
#   ],
#   "parallel_tool_calls": true,
#   "previous_response_id": null,
#   "reasoning": {
#     "effort": null,
#     "summary": null
#   },
#   "store": true,
#   "temperature": 1.0,
#   "text": {
#     "format": {
#       "type": "text"
#     }
#   },
#   "tool_choice": "auto",
#   "tools": [],
#   "top_p": 1.0,
#   "truncation": "disabled",
#   "usage": {
#     "input_tokens": 36,
#     "input_tokens_details": {
#       "cached_tokens": 0
#     },
#     "output_tokens": 87,
#     "output_tokens_details": {
#       "reasoning_tokens": 0
#     },
#     "total_tokens": 123
#   },
#   "user": null,
#   "metadata": {}
# }


# ============================================================
# Anthropic Example
# ============================================================
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

# Multi-turn conversation: Manage messages manully
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

# Response
# {
#   "id": "msg_01XFDUDYJgAACzvnptvVoYEL",
#   "type": "message",
#   "role": "assistant",
#   "content": [
#     {
#       "type": "text",
#       "text": "Hello!"
#     }
#   ],
#   "model": "claude-sonnet-4-5",
#   "stop_reason": "end_turn",
#   "stop_sequence": null,
#   "usage": {
#     "input_tokens": 12,
#     "output_tokens": 6
#   }
# }

# ============================================================
# Google Example
# ============================================================
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
print(response.usage_metadata)

# ============================================================
# Grok Example
# ============================================================

from xai_sdk import Client
from xai_sdk.chat import user, system

client = Client(api_key="")

# 单轮对话

chat = client.chat.create(model="grok-4", store_messages=False)
chat.append(system("You are Grok, a chatbot inspired by the Hitchhiker's Guide to the Galaxy."))
chat.append(user("What is the meaning of life, the universe, and everything?"))
response = chat.sample()

print(response)

# 流式多轮对话
image_grok = client.files.upload("/path/to/your/image.jpg")
pdf_grok = client.files.upload("/path/to/your/document.pdf")

chat = client.chat.create(model="grok-4", store_messages=False)
chat.append(
    system("You are Grok, a chatbot inspired by the Hitchhiker's Guide to the Galaxy."),
)
chat.append(
    user("What is the meaning of life, the universe, and everything?, file(image_grok.id), file(pdf_grok.id)")
)
for response, chunk in chat.stream():
    print(chunk.content, end="", flush=True) # Each chunk's content
    print(response.content, end="", flush=True) # The response object auto-accumulates the chunks

print(response.content) # The full response

# Response Format
# data: {
#     "id":"<completion_id>","object":"chat.completion.chunk","created":<creation_time>,
#     "model":"grok-4",
#     "choices":[{"index":0,"delta":{"content":"Ah","role":"assistant"}}],
#     "usage":{"prompt_tokens":41,"completion_tokens":1,"total_tokens":42,
#     "prompt_tokens_details":{"text_tokens":41,"audio_tokens":0,"image_tokens":0,"cached_tokens":0}},
#     "system_fingerprint":"fp_xxxxxxxxxx"
# }

# data: {
#     "id":"<completion_id>","object":"chat.completion.chunk","created":<creation_time>,
#     "model":"grok-4",
#     "choices":[{"index":0,"delta":{"content":",","role":"assistant"}}],
#     "usage":{"prompt_tokens":41,"completion_tokens":2,"total_tokens":43,
#     "prompt_tokens_details":{"text_tokens":41,"audio_tokens":0,"image_tokens":0,"cached_tokens":0}},
#     "system_fingerprint":"fp_xxxxxxxxxx"
# }

# data: [DONE]

# ============================================================
# Deepseek Example
# ============================================================

client = OpenAI(
    api_key=os.environ.get('DEEPSEEK_API_KEY'),
    base_url="https://api.deepseek.com")

# 单轮对话
response = client.chat.completions.create(
    model="deepseek-chat", # deepseek-chat / deepseek-reasoner
    messages=[
        {"role": "system", "content": "You are a helpful assistant"},
        {"role": "user", "content": "Hello"},
    ],
    stream=False
)

print(response.choices[0].message.content)

# 多轮对话

messages = [{"role": "user", "content": "What's the highest mountain in the world?"}]
response = client.chat.completions.create(
    model="deepseek-chat",
    messages=messages
)

messages.append(response.choices[0].message)
print(f"Messages Round 1: {messages}")

# Round 2
messages.append({"role": "user", "content": "What is the second?"})
response = client.chat.completions.create(
    model="deepseek-chat",
    messages=messages
)

messages.append(response.choices[0].message)
print(f"Messages Round 2: {messages}")

# 流式
response = client.chat.completions.create(
    model="deepseek-chat", # deepseek-chat / deepseek-reasoner
    messages=[
        {"role": "system", "content": "You are a helpful assistant"},
        {"role": "user", "content": "Hello"},
    ],
    stream=True
)

for chunk in response:
  print(chunk.choices[0].delta)


# ============================================================
# Qwen Example
# ============================================================

client = OpenAI(
    api_key=os.getenv("DASHSCOPE_API_KEY"),
    base_url="https://dashscope.aliyuncs.com/compatible-mode/v1",
)
# 单轮对话
response = client.chat.completions.create(
    model="qwen-plus",
    messages=[{'role': 'system', 'content': 'You are a helpful assistant.'},
                {'role': 'user', 'content': '你是谁？'}]
    )

print(response.choices[0].message.content)

print(completion.model_dump_json())

# {
#     "id": "chatcmpl-xxx",
#     "choices": [
#         {
#             "finish_reason": "stop",
#             "index": 0,
#             "logprobs": null,
#             "message": {
#                 "content": "我是来自阿里云的超大规模预训练模型，我叫通义千问。",
#                 "role": "assistant",
#                 "function_call": null,
#                 "tool_calls": null
#             }
#         }
#     ],
#     "created": 1716430652,
#     "model": "qwen-plus",
#     "object": "chat.completion",
#     "system_fingerprint": null,
#     "usage": {
#         "completion_tokens": 18,
#         "prompt_tokens": 22,
#         "total_tokens": 40
#     }
# }

# 流式对话

completion = client.chat.completions.create(
    model="qwen-plus",
    messages=[{'role': 'system', 'content': 'You are a helpful assistant.'},
                {'role': 'user', 'content': '你是谁？'}],
    stream=True,
    stream_options={"include_usage": True}
    )
for chunk in completion:
    print(chunk.model_dump_json())

# {"id":"chatcmpl-xxx","choices":[{"delta":{"content":"","function_call":null,"role":"assistant","tool_calls":null},"finish_reason":null,"index":0,"logprobs":null}],"created":1719286190,"model":"qwen-plus","object":"chat.completion.chunk","system_fingerprint":null,"usage":null}
# {"id":"chatcmpl-xxx","choices":[{"delta":{"content":"我是","function_call":null,"role":null,"tool_calls":null},"finish_reason":null,"index":0,"logprobs":null}],"created":1719286190,"model":"qwen-plus","object":"chat.completion.chunk","system_fingerprint":null,"usage":null}
# {"id":"chatcmpl-xxx","choices":[{"delta":{"content":"来自","function_call":null,"role":null,"tool_calls":null},"finish_reason":null,"index":0,"logprobs":null}],"created":1719286190,"model":"qwen-plus","object":"chat.completion.chunk","system_fingerprint":null,"usage":null}
# {"id":"chatcmpl-xxx","choices":[{"delta":{"content":"阿里","function_call":null,"role":null,"tool_calls":null},"finish_reason":null,"index":0,"logprobs":null}],"created":1719286190,"model":"qwen-plus","object":"chat.completion.chunk","system_fingerprint":null,"usage":null}
# {"id":"chatcmpl-xxx","choices":[{"delta":{"content":"云的大规模语言模型","function_call":null,"role":null,"tool_calls":null},"finish_reason":null,"index":0,"logprobs":null}],"created":1719286190,"model":"qwen-plus","object":"chat.completion.chunk","system_fingerprint":null,"usage":null}
# {"id":"chatcmpl-xxx","choices":[{"delta":{"content":"，我叫通义千问。","function_call":null,"role":null,"tool_calls":null},"finish_reason":null,"index":0,"logprobs":null}],"created":1719286190,"model":"qwen-plus","object":"chat.completion.chunk","system_fingerprint":null,"usage":null}
# {"id":"chatcmpl-xxx","choices":[{"delta":{"content":"","function_call":null,"role":null,"tool_calls":null},"finish_reason":"stop","index":0,"logprobs":null}],"created":1719286190,"model":"qwen-plus","object":"chat.completion.chunk","system_fingerprint":null,"usage":null}
# {"id":"chatcmpl-xxx","choices":[],"created":1719286190,"model":"qwen-plus","object":"chat.completion.chunk","system_fingerprint":null,"usage":{"completion_tokens":16,"prompt_tokens":22,"total_tokens":38}}
