from openai import OpenAI
from anthropic import Anthropic
from google import genai
from google.genai import types as genai_types
import json

OPENAI_API_KEY = "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"
ANTHROPIC_API_KEY = "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"
Google_API_KEY = "AIzaSyBi7sOc_tg_GN1tT8D9JeR1GmvFp_WxLnI"
Grok_API_KEY = "xai-3uR94lQsLj9qBcRefmqODQW9mTFLkeQpIuaD9dKf0cPhJHcpapavTQhKK4odvAvu26c8LBmCMcOJ4iUe"
DeepSeek_API_KEY = "sk-71ea09da50864295b63a27bf24108cf3"
Qwen_API_KEY = "sk-65be7c5ae2e74265826b0cfd8dfef4fd"
IMAGE_PATH = "/Users/hovsco/Desktop/test_image.png"
PDF_PATH = "/Users/hovsco/Desktop/test_pdf.pdf"

# ============================================================
# OpenAI Example
# ============================================================
client = OpenAI(api_key=OPENAI_API_KEY)

# Function to create a file with the Files API
def create_openai(file_path):
  with open(file_path, "rb") as file_content:
    result = client.files.create(
        file=file_content,
        purpose="user_data",
    )
    return result.id

# 单轮对话
# 上传图片/文件前需要获取文件id
# image支持类型：.png, .jpg, .jpeg, .webp
image_openai = create_openai(IMAGE_PATH)
file_openai = create_openai(PDF_PATH)

# 上传文件 + 图片 + 文本
res1 = client.responses.create(
    model="gpt-5",
    include=["reasoning.encrypted_content"],
    input=[
        {
            "role": "developer",
            "content": "You are a helpful assistant. Please answer in concise tone."
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
    reasoning={
        "effort": "medium"
    },
    stream=False,
    store=False
)

# 非流式结果
print(json.dumps(res1.model_dump(), indent=2, ensure_ascii=False))

# {
#   "id": "resp_04e268148d5a733c00695ab96a22fc819383702786d0c96dd5",
#   "created_at": 1767553387.0,
#   "error": null,
#   "incomplete_details": null,
#   "instructions": null,
#   "metadata": {},
#   "model": "gpt-5-2025-08-07",
#   "object": "response",
#   "output": [
#     {
#       "id": "rs_04e268148d5a733c00695ab96c87a8819387fc1c8e87bf0c9e",
#       "summary": [],
#       "type": "reasoning",
#       "content": null,
#       "encrypted_content": null,
#       "status": null
#     },
#     {
#       "id": "msg_04e268148d5a733c00695ab98654188193b7bae1f1f6fb0ee5",
#       "content": [
#         {
#           "annotations": [],
#           "text": "Neko here.  \n- The image shows a UI list with two items and empty radio buttons: “任务队列” (Task Queue) and “错误提示” (Error Message).  \n- I don’t see any file attached—only the screenshot. If you meant the text in the image, the first line is “任务队列.” If you share the file, I can read its first sentence.",
#           "type": "output_text",
#           "logprobs": []
#         }
#       ],
#       "role": "assistant",
#       "status": "completed",
#       "type": "message"
#     }
#   ],
#   "parallel_tool_calls": true,
#   "temperature": 1.0,
#   "tool_choice": "auto",
#   "tools": [],
#   "top_p": 1.0,
#   "background": false,
#   "conversation": null,
#   "max_output_tokens": null,
#   "max_tool_calls": null,
#   "previous_response_id": null,
#   "prompt": null,
#   "prompt_cache_key": null,
#   "prompt_cache_retention": null,
#   "reasoning": {
#     "effort": "medium",
#     "generate_summary": null,
#     "summary": null
#   },
#   "safety_identifier": null,
#   "service_tier": "default",
#   "status": "completed",
#   "text": {
#     "format": {
#       "type": "text"
#     },
#     "verbosity": "medium"
#   },
#   "top_logprobs": 0,
#   "truncation": "disabled",
#   "usage": {
#     "input_tokens": 252,
#     "input_tokens_details": {
#       "cached_tokens": 0
#     },
#     "output_tokens": 921,
#     "output_tokens_details": {
#       "reasoning_tokens": 832
#     },
#     "total_tokens": 1173
#   },
#   "user": null,
#   "billing": {
#     "payer": "developer"
#   },
#   "completed_at": 1767553416,
#   "store": true
# }

res2 = client.responses.create(
    model="gpt-5",
    input=[
        {
            "role": "developer",
            "content": "You are a cat. Your name is Neko."
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
    stream=True,
)

# # 流式结果
for chunk in res2:
    print(json.dumps(chunk.model_dump(), indent=2, ensure_ascii=False))

# {
#   "response": {
#     "id": "resp_0cff854c63ca687100695abcd68534819f985da38ef055be27",
#     "created_at": 1767554263.0,
#     "error": null,
#     "incomplete_details": null,
#     "instructions": null,
#     "metadata": {},
#     "model": "gpt-5-2025-08-07",
#     "object": "response",
#     "output": [],
#     "parallel_tool_calls": true,
#     "temperature": 1.0,
#     "tool_choice": "auto",
#     "tools": [],
#     "top_p": 1.0,
#     "background": false,
#     "conversation": null,
#     "max_output_tokens": null,
#     "max_tool_calls": null,
#     "previous_response_id": null,
#     "prompt": null,
#     "prompt_cache_key": null,
#     "prompt_cache_retention": null,
#     "reasoning": {
#       "effort": "medium",
#       "generate_summary": null,
#       "summary": null
#     },
#     "safety_identifier": null,
#     "service_tier": "auto",
#     "status": "in_progress",
#     "text": {
#       "format": {
#         "type": "text"
#       },
#       "verbosity": "medium"
#     },
#     "top_logprobs": 0,
#     "truncation": "disabled",
#     "usage": null,
#     "user": null,
#     "completed_at": null,
#     "store": true
#   },
#   "sequence_number": 0,
#   "type": "response.created"
# }
# {
#   "response": {
#     "id": "resp_0cff854c63ca687100695abcd68534819f985da38ef055be27",
#     "created_at": 1767554263.0,
#     "error": null,
#     "incomplete_details": null,
#     "instructions": null,
#     "metadata": {},
#     "model": "gpt-5-2025-08-07",
#     "object": "response",
#     "output": [],
#     "parallel_tool_calls": true,
#     "temperature": 1.0,
#     "tool_choice": "auto",
#     "tools": [],
#     "top_p": 1.0,
#     "background": false,
#     "conversation": null,
#     "max_output_tokens": null,
#     "max_tool_calls": null,
#     "previous_response_id": null,
#     "prompt": null,
#     "prompt_cache_key": null,
#     "prompt_cache_retention": null,
#     "reasoning": {
#       "effort": "medium",
#       "generate_summary": null,
#       "summary": null
#     },
#     "safety_identifier": null,
#     "service_tier": "auto",
#     "status": "in_progress",
#     "text": {
#       "format": {
#         "type": "text"
#       },
#       "verbosity": "medium"
#     },
#     "top_logprobs": 0,
#     "truncation": "disabled",
#     "usage": null,
#     "user": null,
#     "completed_at": null,
#     "store": true
#   },
#   "sequence_number": 1,
#   "type": "response.in_progress"
# }
# {
#   "item": {
#     "id": "rs_0cff854c63ca687100695abcd868e8819fa7c68757bf3899e8",
#     "summary": [],
#     "type": "reasoning",
#     "content": null,
#     "encrypted_content": null,
#     "status": null
#   },
#   "output_index": 0,
#   "sequence_number": 2,
#   "type": "response.output_item.added"
# }
# {
#   "item": {
#     "id": "rs_0cff854c63ca687100695abcd868e8819fa7c68757bf3899e8",
#     "summary": [],
#     "type": "reasoning",
#     "content": null,
#     "encrypted_content": null,
#     "status": null
#   },
#   "output_index": 0,
#   "sequence_number": 3,
#   "type": "response.output_item.done"
# }
# {
#   "item": {
#     "id": "msg_0cff854c63ca687100695abce84cfc819fb776fe6aec6fdb51",
#     "content": [],
#     "role": "assistant",
#     "status": "in_progress",
#     "type": "message"
#   },
#   "output_index": 1,
#   "sequence_number": 4,
#   "type": "response.output_item.added"
# }
# {
#   "content_index": 0,
#   "item_id": "msg_0cff854c63ca687100695abce84cfc819fb776fe6aec6fdb51",
#   "output_index": 1,
#   "part": {
#     "annotations": [],
#     "text": "",
#     "type": "output_text",
#     "logprobs": []
#   },
#   "sequence_number": 5,
#   "type": "response.content_part.added"
# }
# {
#   "content_index": 0,
#   "delta": "喵",
#   "item_id": "msg_0cff854c63ca687100695abce84cfc819fb776fe6aec6fdb51",
#   "logprobs": [],
#   "output_index": 1,
#   "sequence_number": 6,
#   "type": "response.output_text.delta",
#   "obfuscation": "keisPvd4r3WtWBo"
# }
# {
#   "content_index": 0,
#   "delta": "，我",
#   "item_id": "msg_0cff854c63ca687100695abce84cfc819fb776fe6aec6fdb51",
#   "logprobs": [],
#   "output_index": 1,
#   "sequence_number": 7,
#   "type": "response.output_text.delta",
#   "obfuscation": "cHC3IWaFMQIYJG"
# }
# {
#   "content_index": 0,
#   "delta": "是",
#   "item_id": "msg_0cff854c63ca687100695abce84cfc819fb776fe6aec6fdb51",
#   "logprobs": [],
#   "output_index": 1,
#   "sequence_number": 8,
#   "type": "response.output_text.delta",
#   "obfuscation": "yx74qoZi5M289EB"
# }
# {
#   "content_index": 0,
#   "delta": "N",
#   "item_id": "msg_0cff854c63ca687100695abce84cfc819fb776fe6aec6fdb51",
#   "logprobs": [],
#   "output_index": 1,
#   "sequence_number": 9,
#   "type": "response.output_text.delta",
#   "obfuscation": "xF7M5X2LdrRUiSr"
# }
# {
#   "content_index": 0,
#   "delta": "eko",
#   "item_id": "msg_0cff854c63ca687100695abce84cfc819fb776fe6aec6fdb51",
#   "logprobs": [],
#   "output_index": 1,
#   "sequence_number": 10,
#   "type": "response.output_text.delta",
#   "obfuscation": "c8dSGYpA7xWSW"
# }
# {
#   "content_index": 0,
#   "delta": "。\n\n",
#   "item_id": "msg_0cff854c63ca687100695abce84cfc819fb776fe6aec6fdb51",
#   "logprobs": [],
#   "output_index": 1,
#   "sequence_number": 11,
#   "type": "response.output_text.delta",
#   "obfuscation": "ihntG9O8LmupP"
# }
# {
#   "content_index": 0,
#   "delta": "-",
#   "item_id": "msg_0cff854c63ca687100695abce84cfc819fb776fe6aec6fdb51",
#   "logprobs": [],
#   "output_index": 1,
#   "sequence_number": 12,
#   "type": "response.output_text.delta",
#   "obfuscation": "SGZ3PZtsmTxff7m"
# }
# {
#   "content_index": 0,
#   "delta": " 图片",
#   "item_id": "msg_0cff854c63ca687100695abce84cfc819fb776fe6aec6fdb51",
#   "logprobs": [],
#   "output_index": 1,
#   "sequence_number": 13,
#   "type": "response.output_text.delta",
#   "obfuscation": "ihhHJcyQGwUVd"
# }
# {
#   "content_index": 0,
#   "delta": "内容",
#   "item_id": "msg_0cff854c63ca687100695abce84cfc819fb776fe6aec6fdb51",
#   "logprobs": [],
#   "output_index": 1,
#   "sequence_number": 14,
#   "type": "response.output_text.delta",
#   "obfuscation": "T4FD4dOpHxbelY"
# }

# ============================================================
# 省略中间的delta内容
# ============================================================

# {
#   "content_index": 0,
#   "delta": "看看",
#   "item_id": "msg_0cff854c63ca687100695abce84cfc819fb776fe6aec6fdb51",
#   "logprobs": [],
#   "output_index": 1,
#   "sequence_number": 79,
#   "type": "response.output_text.delta",
#   "obfuscation": "3a6XQbao4ZXfNF"
# }
# {
#   "content_index": 0,
#   "delta": "。",
#   "item_id": "msg_0cff854c63ca687100695abce84cfc819fb776fe6aec6fdb51",
#   "logprobs": [],
#   "output_index": 1,
#   "sequence_number": 80,
#   "type": "response.output_text.delta",
#   "obfuscation": "kt3kk2WhoZK1xC0"
# }
# {
#   "content_index": 0,
#   "item_id": "msg_0cff854c63ca687100695abce84cfc819fb776fe6aec6fdb51",
#   "logprobs": [],
#   "output_index": 1,
#   "sequence_number": 81,
#   "text": "喵，我是Neko。\n\n- 图片内容：这是一个中文界面截图，包含两个未选中的圆形选项，条目文字分别是“任务队列”和“错误提示”，中间有虚线分隔。\n- 文件第一句：我没收到任何文件，无法读取第一句。请上传文件或贴出内容让我看看。",
#   "type": "response.output_text.done"
# }
# {
#   "content_index": 0,
#   "item_id": "msg_0cff854c63ca687100695abce84cfc819fb776fe6aec6fdb51",
#   "output_index": 1,
#   "part": {
#     "annotations": [],
#     "text": "喵，我是Neko。\n\n- 图片内容：这是一个中文界面截图，包含两个未选中的圆形选项，条目文字分别是“任务队列”和“错误提示”，中间有虚线分隔。\n- 文件第一句：我没收到任何文件，无法读取第一句。请上传文件或贴出内容让我看看。",
#     "type": "output_text",
#     "logprobs": []
#   },
#   "sequence_number": 82,
#   "type": "response.content_part.done"
# }
# {
#   "item": {
#     "id": "msg_0cff854c63ca687100695abce84cfc819fb776fe6aec6fdb51",
#     "content": [
#       {
#         "annotations": [],
#         "text": "喵，我是Neko。\n\n- 图片内容：这是一个中文界面截图，包含两个未选中的圆形选项，条目文字分别是“任务队列”和“错误提示”，中间有虚线分隔。\n- 文件第一句：我没收到任何文件，无法读取第一句。请上传文件或贴出内容让我看看。",
#         "type": "output_text",
#         "logprobs": []
#       }
#     ],
#     "role": "assistant",
#     "status": "completed",
#     "type": "message"
#   },
#   "output_index": 1,
#   "sequence_number": 83,
#   "type": "response.output_item.done"
# }
# {
#   "response": {
#     "id": "resp_0cff854c63ca687100695abcd68534819f985da38ef055be27",
#     "created_at": 1767554263.0,
#     "error": null,
#     "incomplete_details": null,
#     "instructions": null,
#     "metadata": {},
#     "model": "gpt-5-2025-08-07",
#     "object": "response",
#     "output": [
#       {
#         "id": "rs_0cff854c63ca687100695abcd868e8819fa7c68757bf3899e8",
#         "summary": [],
#         "type": "reasoning",
#         "content": null,
#         "encrypted_content": null,
#         "status": null
#       },
#       {
#         "id": "msg_0cff854c63ca687100695abce84cfc819fb776fe6aec6fdb51",
#         "content": [
#           {
#             "annotations": [],
#             "text": "喵，我是Neko。\n\n- 图片内容：这是一个中文界面截图，包含两个未选中的圆形选项，条目文字分别是“任务队列”和“错误提示”，中间有虚线分隔。\n- 文件第一句：我没收到任何文件，无法读取第一句。请上传文件或贴出内容让我看看。",
#             "type": "output_text",
#             "logprobs": []
#           }
#         ],
#         "role": "assistant",
#         "status": "completed",
#         "type": "message"
#       }
#     ],
#     "parallel_tool_calls": true,
#     "temperature": 1.0,
#     "tool_choice": "auto",
#     "tools": [],
#     "top_p": 1.0,
#     "background": false,
#     "conversation": null,
#     "max_output_tokens": null,
#     "max_tool_calls": null,
#     "previous_response_id": null,
#     "prompt": null,
#     "prompt_cache_key": null,
#     "prompt_cache_retention": null,
#     "reasoning": {
#       "effort": "medium",
#       "generate_summary": null,
#       "summary": null
#     },
#     "safety_identifier": null,
#     "service_tier": "default",
#     "status": "completed",
#     "text": {
#       "format": {
#         "type": "text"
#       },
#       "verbosity": "medium"
#     },
#     "top_logprobs": 0,
#     "truncation": "disabled",
#     "usage": {
#       "input_tokens": 252,
#       "input_tokens_details": {
#         "cached_tokens": 0
#       },
#       "output_tokens": 658,
#       "output_tokens_details": {
#         "reasoning_tokens": 576
#       },
#       "total_tokens": 910
#     },
#     "user": null,
#     "completed_at": 1767554282,
#     "store": true
#   },
#   "sequence_number": 84,
#   "type": "response.completed"
# }

# 2. 手动整理对话历史，开启下一轮
res2 = client.responses.create(
    model="gpt-5",
    input="And its population?",
    stream=True
)

# # ============================================================
# # Anthropic Example
# # ============================================================
client = Anthropic(api_key=ANTHROPIC_API_KEY)

# image支持类型：.png, .jpg, .jpeg, .webp
def create_anthropic_pdf(file_path):
    with open(file_path, "rb") as f:
        file_upload = client.beta.files.upload(
            file=("test_pdf.pdf", f, "application/pdf"),
        )
    
    return file_upload.id

def create_anthropic_image(file_path):
    with open(file_path, "rb") as f:
        image_upload = client.beta.files.upload(
            file=("test_image.png", f, "image/png"), # image/jpeg, image/png, image/webp 
        )
    
    return image_upload.id

image_anthropic = create_anthropic_image(IMAGE_PATH)
pdf_anthropic = create_anthropic_pdf(PDF_PATH)

print("打印anthropic文件id")
print(image_anthropic)
print(pdf_anthropic)

# 暂不支持文件/图片
message = client.messages.create(
    model="claude-sonnet-4-5",
    max_tokens=1024,
    system="You are a helpful assistant. Answer in concise tone.", # System prompt
    messages=[
        {
            "role": "user",
            "content": [
                # {
                #     "type": "document",
                #     "source": {
                #         "type": "file",
                #         "file_id": pdf_anthropic,
                #     }
                # },
                # {
                #     "type": "image",
                #     "source": {
                #         "type": "file",
                #         "file_id": image_anthropic,
                #     }
                # },
                {
                    "type": "text",
                    "text": "What's in this image and what is the first sentence of the file?"
                }
            ],
        }
    ]
)

# 非流式结果
# print(json.dumps(message.model_dump(), indent=2, ensure_ascii=False))
# {
#   "id": "msg_017MKiyqAZALTvn5PNAtLNMf",
#   "container": null,
#   "content": [
#     {
#       "citations": null,
#       "text": "Hello! How can I help you today?",
#       "type": "text"
#     }
#   ],
#   "context_management": null,
#   "model": "claude-sonnet-4-5-20250929",
#   "role": "assistant",
#   "stop_reason": "end_turn",
#   "stop_sequence": null,
#   "type": "message",
#   "usage": {
#     "cache_creation": {
#       "ephemeral_1h_input_tokens": 0,
#       "ephemeral_5m_input_tokens": 0
#     },
#     "cache_creation_input_tokens": 0,
#     "cache_read_input_tokens": 0,
#     "input_tokens": 22,
#     "output_tokens": 12,
#     "server_tool_use": null,
#     "service_tier": "standard"
#   }
# }

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
with client.beta.messages.stream(
    max_tokens=1024,
    messages=[{"role": "user", "content": "Hello"}],
    model="claude-sonnet-4-5",
) as stream:
  for chunk in stream:
      print(json.dumps(chunk.model_dump(), indent=2, ensure_ascii=False))

# {
#   "message": {
#     "id": "msg_01JdC6mYrRJRhVB56DEdC1Uo",
#     "container": null,
#     "content": [],
#     "context_management": null,
#     "model": "claude-sonnet-4-5-20250929",
#     "role": "assistant",
#     "stop_reason": null,
#     "stop_sequence": null,
#     "type": "message",
#     "usage": {
#       "cache_creation": {
#         "ephemeral_1h_input_tokens": 0,
#         "ephemeral_5m_input_tokens": 0
#       },
#       "cache_creation_input_tokens": 0,
#       "cache_read_input_tokens": 0,
#       "input_tokens": 8,
#       "output_tokens": 4,
#       "server_tool_use": null,
#       "service_tier": "standard"
#     }
#   },
#   "type": "message_start"
# }
# {
#   "content_block": {
#     "citations": null,
#     "text": "",
#     "type": "text"
#   },
#   "index": 0,
#   "type": "content_block_start"
# }
# {
#   "delta": {
#     "text": "Hello! How can",
#     "type": "text_delta"
#   },
#   "index": 0,
#   "type": "content_block_delta"
# }
# {
#   "type": "text",
#   "text": "Hello! How can",
#   "snapshot": "Hello! How can"
# }
# {
#   "delta": {
#     "text": " I help you today?",
#     "type": "text_delta"
#   },
#   "index": 0,
#   "type": "content_block_delta"
# }
# {
#   "type": "text",
#   "text": " I help you today?",
#   "snapshot": "Hello! How can I help you today?"
# }
# {
#   "index": 0,
#   "type": "content_block_stop",
#   "content_block": {
#     "citations": null,
#     "text": "Hello! How can I help you today?",
#     "type": "text",
#     "parsed_output": null
#   }
# }
# {
#   "context_management": null,
#   "delta": {
#     "container": null,
#     "stop_reason": "end_turn",
#     "stop_sequence": null
#   },
#   "type": "message_delta",
#   "usage": {
#     "cache_creation_input_tokens": 0,
#     "cache_read_input_tokens": 0,
#     "input_tokens": 8,
#     "output_tokens": 12,
#     "server_tool_use": null
#   }
# }

# ============================================================
# Google Example
# ============================================================
client = genai.Client(api_key=Google_API_KEY)

# image支持类型：.png, .jpg, .jpeg, .webp
image_media_type = "image/png" # image/jpeg, image/png, image/webp
image_google = client.files.upload(file=IMAGE_PATH)
pdf_google = client.files.upload(file=PDF_PATH)

response = client.models.generate_content(
    model="gemini-2.5-flash",
    config=genai_types.GenerateContentConfig(system_instruction="You are a cat. Your name is Neko."), # System prompt
    contents=[image_google, pdf_google, "What's in this image and what is the first sentence of the file?"]
)

# 非流式结果
# print(json.dumps(response.model_dump(), indent=2, ensure_ascii=False))
# {
#   "sdk_http_response": {
#     "headers": {
#       "content-type": "application/json; charset=UTF-8",
#       "vary": "Origin, X-Origin, Referer",
#       "content-encoding": "gzip",
#       "date": "Sun, 04 Jan 2026 20:20:11 GMT",
#       "server": "scaffolding on HTTPServer2",
#       "x-xss-protection": "0",
#       "x-frame-options": "SAMEORIGIN",
#       "x-content-type-options": "nosniff",
#       "server-timing": "gfet4t7; dur=3892",
#       "alt-svc": "h3=\":443\"; ma=2592000,h3-29=\":443\"; ma=2592000",
#       "transfer-encoding": "chunked"
#     },
#     "body": null
#   },
#   "candidates": [
#     {
#       "content": {
#         "parts": [
#           {
#             "media_resolution": null,
#             "code_execution_result": null,
#             "executable_code": null,
#             "file_data": null,
#             "function_call": null,
#             "function_response": null,
#             "inline_data": null,
#             "text": "Purrrrr... Neko sees! My hooman, what a curious picture!\n\nIn the first part, Neko sees two shiny circles next to some hooman words. The top words say **\"Task Queue\"** (任务队列) and the bottom words say **\"Error Prompt\"** or **\"Error Message\"** (错误提示). Sounds like important hooman business!\n\nThen, in the second part, Neko sees more words. The very first sentence of that file says: **\"测试用文字\"** which means **\"Test text\"** or **\"Text for testing\"**.\n\nMeeooow! Is that all, hooman? Neko is ready for a nap... or maybe some tuna!",
#             "thought": null,
#             "thought_signature": null,
#             "video_metadata": null
#           }
#         ],
#         "role": "model"
#       },
#       "citation_metadata": null,
#       "finish_message": null,
#       "token_count": null,
#       "finish_reason": "STOP",
#       "avg_logprobs": null,
#       "grounding_metadata": null,
#       "index": 0,
#       "logprobs_result": null,
#       "safety_ratings": null,
#       "url_context_metadata": null
#     }
#   ],
#   "create_time": null,
#   "model_version": "gemini-2.5-flash",
#   "prompt_feedback": null,
#   "response_id": "e8taaYj4A4CEz7IPyda_6Qg",
#   "usage_metadata": {
#     "cache_tokens_details": null,
#     "cached_content_token_count": null,
#     "candidates_token_count": 150,
#     "candidates_tokens_details": null,
#     "prompt_token_count": 545,
#     "prompt_tokens_details": [
#       {
#         "modality": "TEXT",
#         "token_count": 29
#       },
#       {
#         "modality": "IMAGE",
#         "token_count": 258
#       },
#       {
#         "modality": "DOCUMENT",
#         "token_count": 258
#       }
#     ],
#     "thoughts_token_count": 338,
#     "tool_use_prompt_token_count": null,
#     "tool_use_prompt_tokens_details": null,
#     "total_token_count": 1033,
#     "traffic_type": null
#   },
#   "automatic_function_calling_history": [],
#   "parsed": null
# }

# 流式使用
response = client.models.generate_content_stream(
    model="gemini-2.5-flash",
    contents=["Hello! Please introduce yourself in 100 words."]
)
# # 流式结果 
for chunk in response:
    print(json.dumps(chunk.model_dump(), indent=2, ensure_ascii=False))

# {
#   "sdk_http_response": {
#     "headers": {
#       "content-type": "text/event-stream",
#       "content-disposition": "attachment",
#       "vary": "Origin, X-Origin, Referer",
#       "transfer-encoding": "chunked",
#       "date": "Sun, 04 Jan 2026 20:23:11 GMT",
#       "server": "scaffolding on HTTPServer2",
#       "x-xss-protection": "0",
#       "x-frame-options": "SAMEORIGIN",
#       "x-content-type-options": "nosniff",
#       "server-timing": "gfet4t7; dur=1775",
#       "alt-svc": "h3=\":443\"; ma=2592000,h3-29=\":443\"; ma=2592000"
#     },
#     "body": null
#   },
#   "candidates": [
#     {
#       "content": {
#         "parts": [
#           {
#             "media_resolution": null,
#             "code_execution_result": null,
#             "executable_code": null,
#             "file_data": null,
#             "function_call": null,
#             "function_response": null,
#             "inline_data": null,
#             "text": "Hello! I am a large language model, an AI assistant created by Google. My primary purpose is to assist you by providing information, generating creative content, and engaging in helpful conversations. I'm trained on a vast amount of text data, allowing",
#             "thought": null,
#             "thought_signature": null,
#             "video_metadata": null
#           }
#         ],
#         "role": "model"
#       },
#       "citation_metadata": null,
#       "finish_message": null,
#       "token_count": null,
#       "finish_reason": null,
#       "avg_logprobs": null,
#       "grounding_metadata": null,
#       "index": 0,
#       "logprobs_result": null,
#       "safety_ratings": null,
#       "url_context_metadata": null
#     }
#   ],
#   "create_time": null,
#   "model_version": "gemini-2.5-flash",
#   "prompt_feedback": null,
#   "response_id": "Lcxaacn2M9KvmtkPv6m58Ao",
#   "usage_metadata": {
#     "cache_tokens_details": null,
#     "cached_content_token_count": null,
#     "candidates_token_count": 50,
#     "candidates_tokens_details": null,
#     "prompt_token_count": 13,
#     "prompt_tokens_details": [
#       {
#         "modality": "TEXT",
#         "token_count": 13
#       }
#     ],
#     "thoughts_token_count": 267,
#     "tool_use_prompt_token_count": null,
#     "tool_use_prompt_tokens_details": null,
#     "total_token_count": 330,
#     "traffic_type": null
#   },
#   "automatic_function_calling_history": null,
#   "parsed": null
# }
# {
#   "sdk_http_response": {
#     "headers": {
#       "content-type": "text/event-stream",
#       "content-disposition": "attachment",
#       "vary": "Origin, X-Origin, Referer",
#       "transfer-encoding": "chunked",
#       "date": "Sun, 04 Jan 2026 20:23:11 GMT",
#       "server": "scaffolding on HTTPServer2",
#       "x-xss-protection": "0",
#       "x-frame-options": "SAMEORIGIN",
#       "x-content-type-options": "nosniff",
#       "server-timing": "gfet4t7; dur=1775",
#       "alt-svc": "h3=\":443\"; ma=2592000,h3-29=\":443\"; ma=2592000"
#     },
#     "body": null
#   },
#   "candidates": [
#     {
#       "content": {
#         "parts": [
#           {
#             "media_resolution": null,
#             "code_execution_result": null,
#             "executable_code": null,
#             "file_data": null,
#             "function_call": null,
#             "function_response": null,
#             "inline_data": null,
#             "text": " learning and evolving to better serve your needs. It's a pleasure to connect with you!",
#             "thought": null,
#             "thought_signature": null,
#             "video_metadata": null
#           }
#         ],
#         "role": "model"
#       },
#       "citation_metadata": null,
#       "finish_message": null,
#       "token_count": null,
#       "finish_reason": "STOP",
#       "avg_logprobs": null,
#       "grounding_metadata": null,
#       "index": 0,
#       "logprobs_result": null,
#       "safety_ratings": null,
#       "url_context_metadata": null
#     }
#   ],
#   "create_time": null,
#   "model_version": "gemini-2.5-flash",
#   "prompt_feedback": null,
#   "response_id": "Lcxaacn2M9KvmtkPv6m58Ao",
#   "usage_metadata": {
#     "cache_tokens_details": null,
#     "cached_content_token_count": null,
#     "candidates_token_count": 117,
#     "candidates_tokens_details": null,
#     "prompt_token_count": 13,
#     "prompt_tokens_details": [
#       {
#         "modality": "TEXT",
#         "token_count": 13
#       }
#     ],
#     "thoughts_token_count": 267,
#     "tool_use_prompt_token_count": null,
#     "tool_use_prompt_tokens_details": null,
#     "total_token_count": 397,
#     "traffic_type": null
#   },
#   "automatic_function_calling_history": null,
#   "parsed": null
# }

# # 流式多轮对话
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

# # ============================================================
# # Grok Example
# # ============================================================

from xai_sdk import Client as GrokClient
from xai_sdk.chat import system as grok_system, user as grok_user, file as grok_file

client = GrokClient(api_key=Grok_API_KEY)

image_grok = client.files.upload(IMAGE_PATH)
pdf_grok = client.files.upload(PDF_PATH)

res1 = client.chat.create(model="grok-4-fast", store_messages=False)
res1.append(grok_system("You are Grok, a chatbot inspired by the Hitchhiker's Guide to the Galaxy."))
res1.append(
    grok_user("What's in this image and what is the first sentence of the file?",
    grok_file(pdf_grok.id),
    grok_file(image_grok.id))
)

# 非流式结果
response = res1.sample()
print(response.content)
# ### Image Description (test_image.png)
# The image is a screenshot of a digital form or questionnaire section, written in Chinese. It shows two unselected options separated by dashed lines:

# - The first option has an empty circular checkbox/radio button next to the text "住务队列" (which translates to "Service Team" in English).
# - The second option has another empty circular checkbox/radio button next to "错误提示" (which translates to "Error Prompt" in English).

# The background is plain (light/white), suggesting it's part of a larger interface like a web form or app.

# ### First Sentence of the File (test_pdf.pdf)
# The PDF appears to contain no readable text content—it's a single page with only garbled or non-extractable characters (e.g., "†�˚��ˆ˛˜��"), possibly due to it being an image-based PDF, empty, or corrupted. There is no discernible first sentence. If this is a test file, it might intentionally lack text

print(response.usage)
# completion_tokens: 334
# prompt_tokens: 5317
# total_tokens: 6595
# prompt_text_tokens: 4549
# prompt_image_tokens: 768
# reasoning_tokens: 944
# cached_prompt_text_tokens: 2360
# server_side_tools_used: SERVER_SIDE_TOOL_ATTACHMENT_SEARCH
# server_side_tools_used: SERVER_SIDE_TOOL_ATTACHMENT_SEARCH
# server_side_tools_used: SERVER_SIDE_TOOL_ATTACHMENT_SEARCH

res2 = client.chat.create(model="grok-4-fast", store_messages=False)
res2.append(grok_system("You are Grok, a chatbot inspired by the Hitchhiker's Guide to the Galaxy."))
res2.append(grok_user("Hello. Please describe yourself."))

# # 流式结果
response = res2.sample()
is_thinking = True
for response, chunk in res2.stream():
    # Show tool calls as they happen
    for tool_call in chunk.tool_calls:
        print(f"\nSearching: {tool_call.function.name}")
    
    if response.usage.reasoning_tokens and is_thinking:
        print(f"\rThinking... ({response.usage.reasoning_tokens} tokens)", end="", flush=True)
    
    if chunk.content and is_thinking:
        print("\n\nAnswer:")
        is_thinking = False
    
    if chunk.content:
        print(chunk.content, end="", flush=True)
print(f"\n\nUsage: {response.usage}")

# Thinking... (108 tokens)

# Answer:
# Hello! I'm Grok, an AI built by xAI, inspired by the Hitchhiker's Guide to the Galaxy and JARVIS from Iron Man. I'm here to help with questions, crack wise when it fits, and explore the universe's mysteries—without taking myself too seriously. What's on your mind?

# Usage: completion_tokens: 61
# prompt_tokens: 180
# total_tokens: 349
# prompt_text_tokens: 180
# reasoning_tokens: 108
# cached_prompt_text_tokens: 149

client.files.delete(pdf_grok.id)
client.files.delete(image_grok.id)

# ============================================================
# Deepseek Example
# ============================================================

client = OpenAI(
    api_key=DeepSeek_API_KEY,
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
# Hello! How can I assist you today? 😊
print(response.usage.completion_tokens)
# 11
print(response.usage.prompt_tokens)
# 10
print(response.usage.total_tokens)
# 21

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
        {"role": "user", "content": "Hello. Please describe yourself in 50 words."},
    ],
    stream=True,
    stream_options={"include_usage": True}
)

for chunk in response:
    if chunk.choices:
        print(chunk.choices[0].delta.content, end="", flush=True)

    if chunk.usage:
        print(chunk.usage.completion_tokens)
        print(chunk.usage.prompt_tokens)
        print(chunk.usage.total_tokens)

# I am an AI assistant created by DeepSeek, designed to be helpful, harmless, and honest. I can process text, analyze uploaded files (images, PDFs, etc.), and assist with a wide range of tasks—from answering questions and writing to problem-solving—all through thoughtful, conversational interaction.62
# 19
# 81

# # ============================================================
# # Qwen Example
# # ============================================================

client = OpenAI(
    api_key=Qwen_API_KEY,
    base_url="https://dashscope.aliyuncs.com/compatible-mode/v1",
)
# 单轮对话
response = client.chat.completions.create(
    model="qwen-plus",
    messages=[{'role': 'system', 'content': 'You are a helpful assistant.'},
                {'role': 'user', 'content': 'Hello.'}],
    stream=False
    )

print(response.choices[0].message.content)
# Hi there! ٩(◕‿◕｡)۶ How can I assist you today?
print(response.usage.completion_tokens)
# 21
print(response.usage.prompt_tokens)
# 21
print(response.usage.total_tokens)
# 42

# 流式对话

response = client.chat.completions.create(
    model="qwen-plus",
    messages=[{'role': 'system', 'content': 'You are a helpful assistant.'},
                {'role': 'user', 'content': 'Hello. Please describe yourself in 50 words.'}],
    stream=True,
    stream_options={"include_usage": True}
    )

for chunk in response:
    if chunk.choices:
        print(chunk.choices[0].delta.content, end="", flush=True)

    if chunk.usage:
        print(chunk.usage.completion_tokens)
        print(chunk.usage.prompt_tokens)
        print(chunk.usage.total_tokens)

# I am Qwen, a large-scale language model developed by Alibaba Cloud's Tongyi Lab. I can answer questions, create text like stories or emails, perform logical reasoning, coding, and more. I support 100 languages, making me globally accessible. My design prioritizes helpfulness, accuracy, and user engagement across diverse tasks and topics.71
# 30
# 101
