import google.genai as genai
from google.genai import types as genai_types
import asyncio
from pydantic import BaseModel, Field
from typing import List, Optional
import json

OPENAI_API_KEY = "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"
ANTHROPIC_API_KEY = "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"
Google_API_KEY = "AIzaSyBi7sOc_tg_GN1tT8D9JeR1GmvFp_WxLnI"
Grok_API_KEY = "xai-3uR94lQsLj9qBcRefmqODQW9mTFLkeQpIuaD9dKf0cPhJHcpapavTQhKK4odvAvu26c8LBmCMcOJ4iUe"
DeepSeek_API_KEY = "sk-71ea09da50864295b63a27bf24108cf3"
Qwen_API_KEY = "sk-65be7c5ae2e74265826b0cfd8dfef4fd"
IMAGE_PATH = "/Users/hovsco/Desktop/test_image.png"
PDF_PATH = "/Users/hovsco/Desktop/test_pdf.pdf"

class Ingredient(BaseModel):
    name: str = Field(description="Name of the ingredient.")
    quantity: str = Field(description="Quantity of the ingredient, including units.")

class Recipe(BaseModel):
    recipe_name: str = Field(description="The name of the recipe.")
    prep_time_minutes: Optional[int] = Field(description="Optional time in minutes to prepare the recipe.")
    ingredients: List[Ingredient]
    instructions: List[str]

async def main():
    client = genai.Client(api_key=Google_API_KEY)
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

    kwargs: dict = {
        "model": "gemini-3-flash-preview", # "gemini-3-pro-preview"
        "contents": [
            genai_types.Content(
                role="user",
                parts=[
                    genai_types.Part(text=prompt),
                ]
            )
        ],
        "config": genai_types.GenerateContentConfig(
            # Gemini 3 Pro: low | high
            # Gemini 3 Flash: minimum | low | medium | high
            thinking_config=genai_types.ThinkingConfig(thinking_level="low"),
            system_instruction="You are a helpful assistant.",
            response_mime_type="application/json",
            # 注意：在 genai_types 中通常参数名为 response_schema 而非 response_json_schema
            # 传入 Pydantic 生成的 schema 字典
            response_schema=Recipe.model_json_schema(),
        ),
    }

    response = await client.aio.models.generate_content(**kwargs)
    with open("gemini_structure.txt", "w") as f:
        recipe = Recipe.model_validate_json(response.text)
        f.write(json.dumps(recipe.model_dump(), indent=2))
        print(json.dumps(recipe.model_dump(), indent=2))

asyncio.run(main())