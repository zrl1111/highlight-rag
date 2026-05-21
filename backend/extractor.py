"""
Health document extractor — structured field extraction from medical documents.
"""
from __future__ import annotations

import os
import json
import re
import requests
from pathlib import Path
from typing import List, Dict, Any, Optional, Tuple
from datetime import datetime
from dotenv import load_dotenv
from concurrent.futures import ThreadPoolExecutor, as_completed

try:
    from .prompts import EXTRACTION_PROMPT, CATEGORIES
except ImportError:
    from prompts import EXTRACTION_PROMPT, CATEGORIES

_ENV_PATH = Path(__file__).resolve().parent.parent / ".env"
load_dotenv(_ENV_PATH)

try:
    from server.utils.llm_concurrency import llm_slot
except ImportError:
    from contextlib import nullcontext
    llm_slot = nullcontext


# #region agent log
def _agent_dbg(location: str, message: str, hypothesis_id: str, data: dict | None = None) -> None:
    try:
        import time as _t

        log_path = Path(__file__).resolve().parent.parent.parent / "debug-cedaa1.log"
        payload = {
            "sessionId": "cedaa1",
            "location": location,
            "message": message,
            "hypothesisId": hypothesis_id,
            "timestamp": int(_t.time() * 1000),
            "data": data or {},
        }
        with open(log_path, "a", encoding="utf-8") as f:
            f.write(json.dumps(payload, ensure_ascii=False) + "\n")
    except Exception:
        pass


# #endregion


class Extractor:
    """Health document structured field extractor."""

    @staticmethod
    def _build_prompt(template: str, content: str) -> str:
        """Insert document text without str.format (schema JSON contains `{` braces)."""
        if "{content}" not in template:
            return f"{template}\n\n{content}"
        return template.replace("{content}", content)

    def __init__(
        self,
        model: str = os.getenv("EVAL_EXTRACTION_MODEL", "google/gemini-2.5-flash-lite"),
        chunk_size: int = 20000,
        overlap: int = 2000,
        max_workers: int = 5,
    ):
        self.api_key = (os.getenv("OPENROUTER_API_KEY") or "").strip()
        if not self.api_key:
            raise ValueError("OPENROUTER_API_KEY 环境变量未设置")
        if self.api_key.startswith("AIza"):
            raise ValueError(
                "OPENROUTER_API_KEY looks like a Google API key (AIza…). "
                "Use an OpenRouter key from https://openrouter.ai/keys (starts with sk-or-)."
            )
        self.model = model
        self.chunk_size = chunk_size
        self.overlap = overlap
        self.max_workers = max_workers
        self.prompt_template = EXTRACTION_PROMPT

    def _call_api(self, prompt: str, max_retries: int = 3) -> str:
        """调用 OpenRouter API（带重试）"""
        import time
        for attempt in range(max_retries):
            try:
                with llm_slot():
                    resp = requests.post(
                        "https://openrouter.ai/api/v1/chat/completions",
                        headers={
                            "Authorization": f"Bearer {self.api_key}",
                            "Content-Type": "application/json"
                        },
                        json={
                            "model": self.model,
                            "messages": [{"role": "user", "content": prompt}],
                            "max_tokens": 65536
                        },
                        timeout=180
                    )
                if resp.status_code != 200:
                    err_msg = f"API HTTP错误 {resp.status_code}: {resp.text[:200]}"
                    print(err_msg, flush=True)
                    # #region agent log
                    _agent_dbg(
                        "extractor._call_api",
                        "http error",
                        "H2",
                        {
                            "status": resp.status_code,
                            "key_prefix": self.api_key[:4],
                            "err_snippet": resp.text[:120],
                        },
                    )
                    # #endregion
                    if resp.status_code in (401, 403):
                        raise RuntimeError(
                            f"OpenRouter authentication failed ({resp.status_code}). "
                            "Set OPENROUTER_API_KEY in .env to a valid sk-or-… key."
                        )
                    if resp.status_code == 429:
                        wait = 10 * (attempt + 1)
                        print(f"  速率限制，等待 {wait}s 后重试 ({attempt+1}/{max_retries})...", flush=True)
                        time.sleep(wait)
                        continue
                    if attempt < max_retries - 1:
                        time.sleep(2 ** attempt)
                        continue
                    raise RuntimeError(err_msg)

                data = resp.json()
                if 'choices' not in data:
                    print(f"API响应缺少 choices 字段: {data}", flush=True)
                    raise RuntimeError("OpenRouter response missing choices field")

                choice = data['choices'][0]
                finish_reason = choice.get('finish_reason', '')
                content = choice['message']['content']

                if finish_reason == 'length':
                    print(
                        f"  ⚠️ [TRUNCATION] finish_reason=length，响应被截断（{len(content)} chars）。"
                        f"将由上层自动对半拆分重试；若频繁触发，请减小 chunk_size 或优化 health extraction 输出。",
                        flush=True,
                    )
                    return None

                return content

            except requests.exceptions.Timeout as e:
                print(f"  请求超时 ({attempt+1}/{max_retries}): {e}", flush=True)
                if attempt < max_retries - 1:
                    time.sleep(2 ** attempt)
            except requests.exceptions.ConnectionError as e:
                if attempt < max_retries - 1:
                    wait = 2 ** attempt
                    print(f"  连接失败，{wait}秒后重试 ({attempt+1}/{max_retries})...", flush=True)
                    time.sleep(wait)
                else:
                    print(f"  连接失败，已达最大重试次数: {e}", flush=True)
                    return "{}"
            except Exception as e:
                print(f"  API调用异常 ({attempt+1}/{max_retries}): {type(e).__name__}: {e}", flush=True)
                if attempt < max_retries - 1:
                    time.sleep(2 ** attempt)
                else:
                    raise RuntimeError(f"OpenRouter request failed: {e}")
        raise RuntimeError("OpenRouter request failed after retries")

    def _parse_json(self, text: str) -> Dict:
        """解析 JSON 响应"""
        try:
            return json.loads(text)
        except Exception:
            pass

        m = re.search(r'```json\s*([\s\S]*?)\s*```', text)
        if m:
            try:
                return json.loads(m.group(1))
            except Exception:
                pass

        m = re.search(r'\{[\s\S]*\}', text)
        if m:
            try:
                return json.loads(m.group())
            except Exception:
                pass

        return {}

    def _split_chunks(self, content: str) -> List[str]:
        """分块"""
        chunks = []
        start = 0
        while start < len(content):
            end = min(start + self.chunk_size, len(content))
            chunks.append(content[start:end])
            if end >= len(content):
                break
            start = end - self.overlap
        return chunks

    def _count_fields(self, result: Dict) -> int:
        data = result.get("extracted_data") or {}
        return sum(len(data.get(cat) or []) for cat in CATEGORIES)

    def _log_chunk_stats(self, idx: int, result: Dict) -> None:
        data = result.get("extracted_data") or {}
        parts = [f"{cat}:{len(data.get(cat) or [])}" for cat in CATEGORIES]
        total = self._count_fields(result)
        print(f"  块 {idx+1} 完成 -> {total} 个字段 ({', '.join(parts)})", flush=True)

    def _deduplicate_fields(self, fields: List[Dict]) -> List[Dict]:
        """Same field_id + value → keep first entry."""
        if not fields:
            return []

        unique: List[Dict] = []
        seen: set = set()

        for field in fields:
            fid = str(field.get("field_id") or "")
            val = str(field.get("value") if field.get("value") is not None else "")
            key = (fid, val)
            if key in seen:
                continue
            seen.add(key)
            unique.append(field)

        return unique

    def _merge_results(self, results: List[Dict]) -> Dict:
        """合并多个块的提取结果"""
        merged: Dict[str, Any] = {
            "extracted_data": {cat: [] for cat in CATEGORIES},
            "meta": {},
        }

        for r in results:
            if not r:
                continue
            chunk_data = r.get("extracted_data") or {}
            for cat in CATEGORIES:
                items = chunk_data.get(cat)
                if isinstance(items, list):
                    merged["extracted_data"][cat].extend(items)

        for cat in CATEGORIES:
            merged["extracted_data"][cat] = self._deduplicate_fields(
                merged["extracted_data"][cat]
            )

        merged["meta"]["extraction_time"] = datetime.now().isoformat()
        merged["meta"]["total_chunks"] = len(results)
        return merged

    def _process_chunk(self, chunk_info: Tuple[int, str], _min_size: int = 3000) -> Tuple[int, Dict]:
        """处理单个块（用于并行）。"""
        idx, chunk = chunk_info
        prompt = self._build_prompt(self.prompt_template, chunk)
        # #region agent log
        _agent_dbg(
            "extractor._process_chunk",
            "prompt built",
            "H1",
            {
                "chunk_len": len(chunk),
                "prompt_len": len(prompt),
                "content_in_prompt": chunk[:120] in prompt if chunk else False,
                "excerpt_marker": "Health document excerpt:" in prompt,
            },
        )
        # #endregion
        resp = self._call_api(prompt)

        if resp is None:
            if len(chunk) > _min_size * 2:
                mid = len(chunk) // 2
                print(f"  块 {idx+1} 输出截断（{len(chunk)} chars），自动拆分为两个子块重试…", flush=True)
                _, left = self._process_chunk((idx, chunk[:mid]), _min_size)
                _, right = self._process_chunk((idx, chunk[mid:]), _min_size)
                result = self._merge_results([left, right])
            else:
                print(f"  块 {idx+1} 截断且已达最小拆分粒度（{len(chunk)} chars），返回空结果", flush=True)
                result = {}
        else:
            result = self._parse_json(resp)

        self._log_chunk_stats(idx, result)
        return (idx, result)

    def extract(
        self,
        content: str,
        output_path: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        从健康文档内容提取结构化字段。

        Args:
            content: 文档内容（Markdown）
            output_path: 输出 JSON 文件路径（可选）

        Returns:
            提取结果字典（extracted_data, meta, stats）
        """
        print(f"文档: {len(content)} 字符", flush=True)

        if len(content) <= self.chunk_size:
            chunks = [content]
            print(
                f"健康文档: 内容({len(content)} 字符) <= chunk_size({self.chunk_size})，整文传入",
                flush=True,
            )
        else:
            chunks = self._split_chunks(content)
            print(
                f"健康文档: 内容({len(content)} 字符) > chunk_size({self.chunk_size})，分块处理",
                flush=True,
            )
        num_chunks = len(chunks)
        print(f"分为 {num_chunks} 块", flush=True)

        if num_chunks > 1:
            actual_workers = min(self.max_workers, num_chunks)
            print(f"使用 {actual_workers} 个并行工作线程", flush=True)

            chunk_infos = [(i, chunk) for i, chunk in enumerate(chunks)]
            all_results: List[Optional[Dict]] = [None] * num_chunks
            with ThreadPoolExecutor(max_workers=actual_workers) as executor:
                futures = {executor.submit(self._process_chunk, info): info[0] for info in chunk_infos}

                for future in as_completed(futures):
                    idx = futures[future]
                    try:
                        result_idx, result = future.result()
                        all_results[result_idx] = result
                    except Exception as e:
                        print(f"  块 {idx+1} 处理失败: {e}", flush=True)
                        all_results[idx] = {}
        else:
            print("处理 1/1...", flush=True)
            prompt = self._build_prompt(self.prompt_template, chunks[0])
            resp = self._call_api(prompt)
            result = self._parse_json(resp) if resp is not None else {}
            self._log_chunk_stats(0, result)
            all_results = [result]

        merged = self._merge_results(all_results)

        stats = {
            f"total_{cat}": len(merged["extracted_data"].get(cat) or [])
            for cat in CATEGORIES
        }
        merged["stats"] = stats

        if output_path:
            Path(output_path).parent.mkdir(parents=True, exist_ok=True)
            Path(output_path).write_text(
                json.dumps(merged, ensure_ascii=False, indent=2),
                encoding='utf-8',
            )
            print(f"已保存到: {output_path}", flush=True)

        summary = ", ".join(f"{cat}:{stats[f'total_{cat}']}" for cat in CATEGORIES)
        print(f"\n完成! {summary}", flush=True)

        return merged

    def extract_file(
        self,
        input_path: str,
        output_path: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        从文件提取

        Args:
            input_path: 输入文件路径（Markdown）
            output_path: 输出文件路径（JSON），默认同名.json
        """
        input_file = Path(input_path)
        if not input_file.exists():
            raise FileNotFoundError(f"文件不存在: {input_path}")

        content = input_file.read_text(encoding='utf-8')

        if not output_path:
            output_path = str(input_file.with_suffix('.json'))

        return self.extract(content, output_path)
