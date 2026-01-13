from google import genai
from pydantic import BaseModel, Field
from typing import List, Optional

class Ingredient(BaseModel):
    name: str = Field(description="Name of the ingredient.")
    quantity: str = Field(description="Quantity of the ingredient, including units.")

class Recipe(BaseModel):
    recipe_name: str = Field(description="The name of the recipe.")
    prep_time_minutes: Optional[int] = Field(description="Optional time in minutes to prepare the recipe.")
    ingredients: List[Ingredient]
    instructions: List[str]

client = genai.Client()

prompt = """
Please extract the recipe from the following text.
The user wants to make delicious chocolate chip cookies.
They need 2 and 1/4 cups of all-purpose flour, 1 teaspoon of baking soda,
1 teaspoon of salt, 1 cup of unsalted butter (softened), 3/4 cup of granulated sugar,
3/4 cup of packed brown sugar, 1 teaspoon of vanilla extract, and 2 large eggs.
For the best part, they'll need 2 cups of semisweet chocolate chips.
First, preheat the oven to 375°F (190°C). Then, in a small bowl, whisk together the flour,
baking soda, and salt. In a large bowl, cream together the butter, granulated sugar, and brown sugar
until light and fluffy. Beat in the vanilla and eggs, one at a time. Gradually beat in the dry
ingredients until just combined. Finally, stir in the chocolate chips. Drop by rounded tablespoons
onto ungreased baking sheets and bake for 9 to 11 minutes.
"""

response = client.models.generate_content(
    model="gemini-2.5-flash",
    contents=prompt,
    config={
        "response_mime_type": "application/json",
        "response_json_schema": Recipe.model_json_schema(),
    },
)

recipe = Recipe.model_validate_json(response.text)
print(recipe)

# curl "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent" \
#     -H "x-goog-api-key: $GEMINI_API_KEY" \
#     -H 'Content-Type: application/json' \
#     -X POST \
#     -d '{
#       "contents": [{
#         "parts":[
#           { "text": "Please extract the recipe from the following text.\nThe user wants to make delicious chocolate chip cookies.\nThey need 2 and 1/4 cups of all-purpose flour, 1 teaspoon of baking soda,\n1 teaspoon of salt, 1 cup of unsalted butter (softened), 3/4 cup of granulated sugar,\n3/4 cup of packed brown sugar, 1 teaspoon of vanilla extract, and 2 large eggs.\nFor the best part, they will need 2 cups of semisweet chocolate chips.\nFirst, preheat the oven to 375°F (190°C). Then, in a small bowl, whisk together the flour,\nbaking soda, and salt. In a large bowl, cream together the butter, granulated sugar, and brown sugar\nuntil light and fluffy. Beat in the vanilla and eggs, one at a time. Gradually beat in the dry\ningredients until just combined. Finally, stir in the chocolate chips. Drop by rounded tablespoons\nonto ungreased baking sheets and bake for 9 to 11 minutes." }
#         ]
#       }],
#       "generationConfig": {
#         "responseMimeType": "application/json",
#         "responseJsonSchema": {
#           "type": "object",
#           "properties": {
#             "recipe_name": {
#               "type": "string",
#               "description": "The name of the recipe."
#             },
#             "prep_time_minutes": {
#                 "type": "integer",
#                 "description": "Optional time in minutes to prepare the recipe."
#             },
#             "ingredients": {
#               "type": "array",
#               "items": {
#                 "type": "object",
#                 "properties": {
#                   "name": { "type": "string", "description": "Name of the ingredient."},
#                   "quantity": { "type": "string", "description": "Quantity of the ingredient, including units."}
#                 },
#                 "required": ["name", "quantity"]
#               }
#             },
#             "instructions": {
#               "type": "array",
#               "items": { "type": "string" }
#             }
#           },
#           "required": ["recipe_name", "ingredients", "instructions"]
#         }
#       }
#     }'