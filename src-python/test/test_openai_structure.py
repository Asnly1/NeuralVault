import openai
import asyncio
import json
from copy import deepcopy
from typing import Any, Dict, Type
from pydantic import BaseModel

OPENAI_API_KEY = "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"
ANTHROPIC_API_KEY = "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"
Google_API_KEY = "AIzaSyBi7sOc_tg_GN1tT8D9JeR1GmvFp_WxLnI"
Grok_API_KEY = "xai-3uR94lQsLj9qBcRefmqODQW9mTFLkeQpIuaD9dKf0cPhJHcpapavTQhKK4odvAvu26c8LBmCMcOJ4iUe"
DeepSeek_API_KEY = "sk-71ea09da50864295b63a27bf24108cf3"
Qwen_API_KEY = "sk-65be7c5ae2e74265826b0cfd8dfef4fd"
IMAGE_PATH = "/Users/hovsco/Desktop/test_image.png"
PDF_PATH = "/Users/hovsco/Desktop/test_pdf.pdf"

async def main():
    client = openai.AsyncOpenAI(api_key=OPENAI_API_KEY)

    class Step(BaseModel):
        explanation: str
        output: str

    class MathReasoning(BaseModel):
        steps: list[Step]
        final_answer: str

    input_items: list[dict] = []

    input_items.append({"role": "developer", "content": "You are a helpful math tutor. Guide the user through the solution step by step."})

    content_items: list[dict] = []
    content_items.append({"type": "input_text", "text": "how can I solve 8x + 7 = -23?"})

    input_items.append(
        {
            "role": "user",
            "content": content_items,
        }
    )

    def pydantic_schema_to_official_style(schema: Dict[str, Any]) -> Dict[str, Any]:
        schema = deepcopy(schema)
        defs = schema.get("$defs", {})

        def resolve_ref(ref: str) -> Dict[str, Any]:
            # only support local refs like "#/$defs/Step"
            prefix = "#/$defs/"
            if not ref.startswith(prefix):
                raise ValueError(f"Unsupported $ref: {ref}")
            key = ref[len(prefix):]
            if key not in defs:
                raise KeyError(f"$ref target not found in $defs: {key}")
            return deepcopy(defs[key])

        def normalize(node: Any) -> Any:
            if isinstance(node, list):
                return [normalize(x) for x in node]
            if not isinstance(node, dict):
                return node

            # Inline $ref
            if "$ref" in node:
                inlined = resolve_ref(node["$ref"])
                # merge: local keys override inlined keys (rare but safe)
                merged = {**inlined, **{k: v for k, v in node.items() if k != "$ref"}}
                return normalize(merged)

            # Build a cleaned dict, dropping noisy keys
            out: Dict[str, Any] = {}
            for k, v in node.items():
                if k in {"title", "$defs"}:
                    continue
                out[k] = normalize(v)

            # Force additionalProperties false for objects
            if out.get("type") == "object":
                out.setdefault("properties", {})
                out.setdefault("required", list(out["properties"].keys()) if out["properties"] else [])
                out["additionalProperties"] = False

            return out

        # normalize root, and drop $defs at the end
        result = normalize(schema)
        if isinstance(result, dict):
            result.pop("$defs", None)
        return result

    def text_format_from_pydantic(model: Type[BaseModel], strict: bool = True) -> Dict[str, Any]:
        raw = model.model_json_schema()
        official = pydantic_schema_to_official_style(raw)
        return {
            "type": "json_schema",
            "name": model.__name__,
            "schema": official,
            "strict": strict,
        }

    format = text_format_from_pydantic(MathReasoning)
    # print(json.dumps(format, indent=2, ensure_ascii=False))
    
    payload: dict = {
        "model": "gpt-5.2-2025-12-11",
        "input": input_items,
        "reasoning": {
            "effort": "medium"
        },
        "text": {
            "format": format
        }
    }


    response = await client.responses.create(**payload)
    with open("openai_reasoning_structure_1.txt", "w", encoding="utf-8") as f:
        parsed = MathReasoning.model_validate_json(response.output_text)


        print(parsed.model_dump_json(indent=2, ensure_ascii=False))
        f.write(parsed.model_dump_json(indent=2, ensure_ascii=False))

        reasoning_tokens = getattr(response, "usage.output_tokens_details.reasoning_tokens", 0) or 0
        usage = {
            "input_tokens": response.usage.input_tokens,
            "output_tokens": response.usage.output_tokens,
            "reasoning_tokens": reasoning_tokens,
            "total_tokens": response.usage.total_tokens + reasoning_tokens,
        }
        if usage:
            print("type: usage", "usage:", usage)
            f.write("\n")
            f.write(json.dumps(usage))
        

asyncio.run(main())