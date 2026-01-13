from google import genai

client = genai.Client()
chat = client.chats.create(model="gemini-2.5-flash")

response = chat.send_message_stream("I have 2 dogs in my house.")
for chunk in response:
    print(chunk.text, end="")

response = chat.send_message_stream("How many paws are in my house?")
for chunk in response:
    print(chunk.text, end="")

for message in chat.get_history():
    print(f'role - {message.role}', end=": ")
    print(message.parts[0].text)


# curl https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:streamGenerateContent?alt=sse \
#   -H "x-goog-api-key: $GEMINI_API_KEY" \
#   -H 'Content-Type: application/json' \
#   -X POST \
#   -d '{
#     "contents": [
#       {
#         "role": "user",
#         "parts": [
#           {
#             "text": "Hello"
#           }
#         ]
#       },
#       {
#         "role": "model",
#         "parts": [
#           {
#             "text": "Great to meet you. What would you like to know?"
#           }
#         ]
#       },
#       {
#         "role": "user",
#         "parts": [
#           {
#             "text": "I have two dogs in my house. How many paws are in my house?"
#           }
#         ]
#       }
#     ]
#   }'