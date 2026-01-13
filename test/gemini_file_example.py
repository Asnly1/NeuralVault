from google import genai

client = genai.Client()

######################################################
# Upload File:
######################################################

myfile = client.files.upload(file="path/to/sample.mp3")

response = client.models.generate_content(
    model="gemini-2.5-flash", contents=["Describe this audio clip", myfile]
)

print(response.text)

# AUDIO_PATH="path/to/sample.mp3"
# MIME_TYPE=$(file -b --mime-type "${AUDIO_PATH}")
# NUM_BYTES=$(wc -c < "${AUDIO_PATH}")
# DISPLAY_NAME=AUDIO

# tmp_header_file=upload-header.tmp

# # Initial resumable request defining metadata.
# # The upload url is in the response headers dump them to a file.
# curl "${BASE_URL}/upload/v1beta/files" \
#   -H "x-goog-api-key: $GEMINI_API_KEY" \
#   -D "${tmp_header_file}" \
#   -H "X-Goog-Upload-Protocol: resumable" \
#   -H "X-Goog-Upload-Command: start" \
#   -H "X-Goog-Upload-Header-Content-Length: ${NUM_BYTES}" \
#   -H "X-Goog-Upload-Header-Content-Type: ${MIME_TYPE}" \
#   -H "Content-Type: application/json" \
#   -d "{'file': {'display_name': '${DISPLAY_NAME}'}}" 2> /dev/null

# upload_url=$(grep -i "x-goog-upload-url: " "${tmp_header_file}" | cut -d" " -f2 | tr -d "\r")
# rm "${tmp_header_file}"

# # Upload the actual bytes.
# curl "${upload_url}" \
#   -H "Content-Length: ${NUM_BYTES}" \
#   -H "X-Goog-Upload-Offset: 0" \
#   -H "X-Goog-Upload-Command: upload, finalize" \
#   --data-binary "@${AUDIO_PATH}" 2> /dev/null > file_info.json

# file_uri=$(jq ".file.uri" file_info.json)
# echo file_uri=$file_uri

# # Now generate content using that file
# curl "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent" \
#     -H "x-goog-api-key: $GEMINI_API_KEY" \
#     -H 'Content-Type: application/json' \
#     -X POST \
#     -d '{
#       "contents": [{
#         "parts":[
#           {"text": "Describe this audio clip"},
#           {"file_data":{"mime_type": "${MIME_TYPE}", "file_uri": '$file_uri'}}]
#         }]
#       }' 2> /dev/null > response.json

# cat response.json
# echo

# jq ".candidates[].content.parts[].text" response.json

######################################################
# Get File:
######################################################

myfile = client.files.upload(file='path/to/sample.mp3')
file_name = myfile.name
myfile = client.files.get(name=file_name)
print(myfile)

# # file_info.json was created in the upload example
# name=$(jq ".file.name" file_info.json)
# # Get the file of interest to check state
# curl https://generativelanguage.googleapis.com/v1beta/files/$name \
# -H "x-goog-api-key: $GEMINI_API_KEY" > file_info.json
# # Print some information about the file you got
# name=$(jq ".file.name" file_info.json)
# echo name=$name
# file_uri=$(jq ".file.uri" file_info.json)
# echo file_uri=$file_uri