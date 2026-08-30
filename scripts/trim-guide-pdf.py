from pathlib import Path
import sys

from pypdf import PdfReader, PdfWriter


def main() -> None:
    if len(sys.argv) != 2:
        raise SystemExit("Usage: trim-guide-pdf.py <guide.pdf>")

    path = Path(sys.argv[1])
    reader = PdfReader(path)
    if len(reader.pages) != 12:
        raise RuntimeError(f"Expected 12 browser-print pages before trimming, found {len(reader.pages)}")

    writer = PdfWriter()
    for page in reader.pages[1:-1]:
        writer.add_page(page)

    temporary = path.with_suffix(".trimmed.pdf")
    with temporary.open("wb") as stream:
        writer.write(stream)
    temporary.replace(path)


if __name__ == "__main__":
    main()
