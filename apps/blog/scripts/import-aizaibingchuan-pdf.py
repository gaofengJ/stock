#!/usr/bin/env python3
"""Import annual 爱在冰川 PDF collections into the VitePress blog."""

from __future__ import annotations

import argparse
import hashlib
from io import BytesIO
import json
import re
import shutil
import subprocess
import sys
import tempfile
from collections import Counter
from dataclasses import dataclass, field
from pathlib import Path

from pypdf import PdfReader


BLOG_ROOT = Path(__file__).resolve().parent.parent
REVIEW_ROOT = BLOG_ROOT / "docs/src/reviews/aizaibingchuan"
PUBLIC_ROOT = BLOG_ROOT / "docs/src/public/imgs/aizaibingchuan"
INDEX_FILE = REVIEW_ROOT / "index.md"
REPORT_ROOT = REVIEW_ROOT / "reports"
HEADER_RE = re.compile(r"^爱在冰川\s+(20\d{2})-(\d{2})-(\d{2})$")
FOOTER_RE = re.compile(r"第\d+页.*版权属原作者所有.*全利兔")
ARCHIVE_AD_RE = re.compile(r"^打开支付宝首页搜索")
SOURCE_URL_RE = re.compile(r"^(?:source_url:\s*[\"']?|原文链接:\s*<)([^\"'>\n]+)", re.MULTILINE)


@dataclass
class Article:
    year: int
    date: str
    title: str
    first_page: int
    pages: list[tuple[int, str]] = field(default_factory=list)


def arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Import annual PDF collections.")
    parser.add_argument("--pdf", action="append", metavar="YEAR=PATH")
    parser.add_argument("--reindex", action="store_true", help="Rebuild the article index in descending date order.")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--limit", type=int, help="Process the first N articles of each PDF.")
    parser.add_argument("--pdftotext", default=shutil.which("pdftotext"))
    parser.add_argument("--repeat-image-threshold", type=int, default=50)
    return parser.parse_args()


def parse_pdf_values(values: list[str]) -> dict[int, Path]:
    results: dict[int, Path] = {}
    for value in values:
        try:
            year_text, source = value.split("=", 1)
            year, path = int(year_text), Path(source).expanduser().resolve()
        except ValueError as error:
            raise ValueError(f"Invalid --pdf value: {value}; expected YEAR=PATH.") from error
        if year < 2000 or not path.is_file() or year in results:
            raise ValueError(f"Unavailable or duplicate PDF: {value}")
        results[year] = path
    return dict(sorted(results.items()))


def digest(value: bytes | str) -> str:
    return hashlib.sha256(value.encode() if isinstance(value, str) else value).hexdigest()


def clean_line(value: str) -> str:
    return re.sub(r"[ \t]{2,}", " ", value).strip()


def first_page_header(page: str) -> tuple[str, str] | None:
    lines = [clean_line(line) for line in page.splitlines() if clean_line(line)]
    for index, line in enumerate(lines[:10]):
        found = HEADER_RE.fullmatch(line)
        if found:
            title = lines[index - 1] if index else "爱在冰川复盘"
            return f"{found.group(1)}-{int(found.group(2))}-{int(found.group(3))}", title
    return None


def page_body(page: str, is_first_page: bool) -> str:
    lines = [clean_line(line) for line in page.splitlines()]
    if is_first_page:
        header_index = next(
            (index for index, line in enumerate(lines[:10]) if HEADER_RE.fullmatch(line)),
            None,
        )
        if header_index is not None:
            lines = lines[header_index + 1 :]
    return "\n\n".join(
        line for line in lines if line and not FOOTER_RE.search(line) and not ARCHIVE_AD_RE.search(line)
    ).strip()


def pdf_pages(source: Path, pdftotext: str | None) -> list[str]:
    if not pdftotext:
        raise RuntimeError("pdftotext is required; pass --pdftotext with its absolute path.")
    with tempfile.TemporaryDirectory(prefix="aizaibingchuan-pdf-") as directory:
        output = Path(directory) / "article.txt"
        process = subprocess.run(
            [pdftotext, "-layout", str(source), str(output)],
            capture_output=True,
            check=False,
            text=True,
        )
        if process.returncode:
            raise RuntimeError(process.stderr.strip() or f"pdftotext failed for {source.name}")
        return output.read_text(encoding="utf-8", errors="replace").split("\f")[:-1]


def articles_from_pages(year: int, pages: list[str]) -> tuple[list[Article], list[int]]:
    articles: list[Article] = []
    unassigned: list[int] = []
    current: Article | None = None
    for page_number, page in enumerate(pages, 1):
        header = first_page_header(page)
        if header:
            date, title = header
            current = Article(year, date, title, page_number)
            articles.append(current)
        if current is None:
            unassigned.append(page_number)
            continue
        current.pages.append((page_number, page_body(page, header is not None)))
    if not articles:
        raise RuntimeError(f"No article headers found in {year}.")
    return articles, unassigned


def extension(name: str) -> str:
    suffix = Path(name).suffix.lower()
    return suffix if re.fullmatch(r"\.[a-z0-9]{2,5}", suffix) else ".png"


def asset_bytes(image: object) -> tuple[bytes, str]:
    suffix = extension(image.name)
    if suffix != ".jp2":
        return image.data, suffix
    output = BytesIO()
    image.image.save(output, format="PNG")
    return output.getvalue(), ".png"


def image_counts(reader: PdfReader) -> Counter[str]:
    counts: Counter[str] = Counter()
    for page in reader.pages:
        for image in page.images:
            counts[digest(image.data)] += 1
    return counts


def article_images(
    reader: PdfReader,
    article: Article,
    counts: Counter[str],
    threshold: int,
    should_write: bool,
) -> list[tuple[int, str]]:
    results: list[tuple[int, str]] = []
    seen: set[str] = set()
    folder = PUBLIC_ROOT / str(article.year)
    for page_number, _ in article.pages:
        for image in reader.pages[page_number - 1].images:
            fingerprint = digest(image.data)
            if fingerprint in seen or counts[fingerprint] >= threshold:
                continue
            seen.add(fingerprint)
            payload, suffix = asset_bytes(image)
            filename = f"{fingerprint[:20]}{suffix}"
            if should_write:
                folder.mkdir(parents=True, exist_ok=True)
                target = folder / filename
                if not target.exists():
                    target.write_bytes(payload)
            results.append((page_number, f"/imgs/aizaibingchuan/{article.year}/{filename}"))
    return results


def source_url(path: Path) -> str | None:
    if not path.exists():
        return None
    found = SOURCE_URL_RE.search(path.read_text(encoding="utf-8", errors="replace"))
    return found.group(1).strip() if found else None


def filename(article: Article, occurrence: int) -> str:
    return f"{article.date}.md" if occurrence == 1 else f"{article.date}-pdf-{article.first_page}.md"


def order_value(article: Article) -> int:
    year, month, day = (int(value) for value in article.date.split("-"))
    return int(f"{year:04d}{month:02d}{day:02d}") * 10000 + article.first_page


def document(article: Article, source: Path, url: str | None, images: list[tuple[int, str]]) -> str:
    by_page: dict[int, list[str]] = {}
    for page_number, image_url in images:
        by_page.setdefault(page_number, []).append(image_url)
    blocks: list[str] = []
    for page_number, text in article.pages:
        if text:
            blocks.append(text)
        blocks.extend(f"![PDF 第 {page_number} 页配图]({image_url})" for image_url in by_page.get(page_number, []))
    content = "\n\n".join(blocks).strip()
    frontmatter = [
        "---",
        f"title: {json.dumps(article.date + '复盘', ensure_ascii=False)}",
        f"order: {order_value(article)}",
        f"source_title: {json.dumps(article.title, ensure_ascii=False)}",
        f"source_pdf: {json.dumps(source.name, ensure_ascii=False)}",
        f"source_pdf_pages: {json.dumps(f'{article.first_page}-{article.pages[-1][0]}')}",
        f"content_sha256: {digest(content)}",
        f"image_count: {len(images)}",
    ]
    if url:
        frontmatter.append(f"source_url: {json.dumps(url, ensure_ascii=False)}")
    frontmatter.extend(
        [
            "---",
            "",
            f"# {article.date}复盘",
            "",
            "作者：**爱在冰川**",
            "",
            f"PDF 来源：{source.name}，第 {article.first_page}-{article.pages[-1][0]} 页。",
            "",
            "> 原 PDF 标注：版权属原作者所有，仅阅读，不作商业用途。",
            "",
            "## 原文内容",
            "",
            content,
            "",
        ]
    )
    return "\n".join(frontmatter)


def update_index(_paths: list[Path]) -> int:
    if not INDEX_FILE.is_file():
        raise RuntimeError(f"Missing archive landing page: {INDEX_FILE}")
    entries = 0
    for year_directory in REVIEW_ROOT.iterdir():
        if not year_directory.is_dir() or not re.fullmatch(r"20\d{2}", year_directory.name):
            continue
        entries += sum(1 for _ in year_directory.glob("*.md"))
    return entries


def report(year: int, source: Path, detected: int, processed: list[dict[str, object]], unassigned: list[int]) -> None:
    REPORT_ROOT.mkdir(parents=True, exist_ok=True)
    lines = [
        "---",
        f'title: "PDF 导入报告 {year}"',
        f"order: {year}1231",
        "---",
        "",
        f"# PDF 导入报告 {year}",
        "",
        f"- PDF：{source.name}",
        f"- 文章边界：{detected} 篇",
        f"- 已写入文章：{len(processed)} 篇",
        f"- 未归属页：{len(unassigned)} 页",
        "- 图片规则：保留嵌入正文图片；出现 50 次及以上的重复水印/界面图不导入。",
        "",
        "## 文章清单",
        "",
    ]
    lines.extend(
        f"- {item['date']}：{item['title']}（PDF {item['pages']} 页，图片 {item['images']} 张）"
        for item in processed
    )
    if unassigned:
        lines.extend(["", "## 未归属页", "", ", ".join(map(str, unassigned))])
    (REPORT_ROOT / f"pdf-import-{year}.md").write_text("\n".join(lines) + "\n", encoding="utf-8")


def import_year(year: int, source: Path, args: argparse.Namespace) -> tuple[list[Path], dict[str, int]]:
    articles, unassigned = articles_from_pages(year, pdf_pages(source, args.pdftotext))
    selected = articles[: args.limit] if args.limit else articles
    reader = PdfReader(source)
    counts = image_counts(reader)
    occurrences: Counter[str] = Counter()
    generated: list[Path] = []
    report_rows: list[dict[str, object]] = []
    for article in selected:
        occurrences[article.date] += 1
        target = REVIEW_ROOT / str(year) / filename(article, occurrences[article.date])
        images = article_images(reader, article, counts, args.repeat_image_threshold, not args.dry_run)
        if not args.dry_run:
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(document(article, source, source_url(target), images), encoding="utf-8")
        generated.append(target)
        report_rows.append(
            {"date": article.date, "title": article.title, "pages": f"{article.first_page}-{article.pages[-1][0]}", "images": len(images)}
        )
    if not args.dry_run:
        report(year, source, len(articles), report_rows, unassigned)
    return generated, {"detected": len(articles), "processed": len(selected), "unassigned": len(unassigned)}


def main() -> None:
    args = arguments()
    if args.reindex:
        print(f"Validated {update_index([])} archived article entries.")
        return
    if not args.pdf:
        raise ValueError("Provide at least one --pdf YEAR=PATH, or use --reindex.")
    all_paths: list[Path] = []
    total = 0
    for year, source in parse_pdf_values(args.pdf).items():
        paths, summary = import_year(year, source, args)
        all_paths.extend(paths)
        total += summary["processed"]
        print(f"{year}: detected {summary['detected']}, processed {summary['processed']}, unassigned {summary['unassigned']}")
    if not args.dry_run:
        print(f"Archived article entries: {update_index(all_paths)}")
    print(f"{'Validated' if args.dry_run else 'Imported'} {total} article(s).")


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(f"Import failed: {error}", file=sys.stderr)
        raise SystemExit(1)
