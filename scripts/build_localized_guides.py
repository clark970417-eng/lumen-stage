"""Build all localized LUMEN STAGE guides from production UI captures.

Every chapter uses a distinct capture from https://lumen-stage.vercel.app/.
Slides are rendered as lossless 300 dpi PNG files; JPEG quality settings are
intentionally not part of this pipeline.
"""

from pathlib import Path
import os
import shutil
import subprocess

from PIL import Image
from reportlab.lib.colors import HexColor
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas

ROOT = Path(__file__).resolve().parents[1]
CAPTURES = Path(os.environ.get("LUMEN_GUIDE_CAPTURE_DIR", ROOT / "tmp" / "guide-captures"))
PUBLIC = ROOT / "public"
PAGES = PUBLIC / "guide-pages"
W, H = landscape(A4)

BG = HexColor("#080B0F")
PANEL = HexColor("#111820")
PANEL_2 = HexColor("#18232C")
INK = HexColor("#EDF2F5")
MUTED = HexColor("#8FA3B0")
BLUE = HexColor("#67D8FF")
LINE = HexColor("#344755")
EMBED_SCALE = 300 / 72

SOURCES = [
    "desktop-00-cover-focus.png", "desktop-01-tone.png", "desktop-02-blocking.png",
    "desktop-03-shaping-before.png", "desktop-03-shaping-after.png",
    "desktop-04-framing.png", "desktop-05-validation.png",
    "desktop-06-shoot-blueprint.png", "desktop-07-current-decision.png",
    "desktop-10-final-check.png", "mobile-01-tone.png", "mobile-02-blocking.png",
    "mobile-03-shaping.png", "mobile-04-framing.png", "mobile-05-validation.png",
]

GUIDES = {
    "zh": {
        "filename": "LUMEN_STAGE_網站使用教學.pdf", "label": "繁體中文 · 正式版介面教學",
        "title": "從決策到成片", "subtitle": "定調、走位、塑光、取景、驗證：完成一次拍攝。",
        "footer": "LUMEN STAGE 網站使用教學",
        "pages": [
            ("從這裡開始", "START HERE", "先做大決策，再進入精確器材參數。", ["頂部五階段是主流程", "左側是拍攝藍圖", "右側是目前決策"]),
            ("五步拍攝流程", "DECISION FLOW", "手機與完整版共用同一組決策語言。", ["定調", "走位", "塑光", "取景", "驗證"]),
            ("定調", "01 / TONE", "先定義想做出的畫面，再帶入燈位起點。", ["選擇參考照配光或視覺風格", "不用先在參數面板裡搜尋", "確認拍攝藍圖的視覺目標"]),
            ("走位", "02 / BLOCKING", "處理人物、燈具、附件與鏡頭的空間關係。", ["棚內看高度與遮擋", "俯視看角度與距離", "用移動、旋轉、瞄準完成位置"]),
            ("塑光", "03 / SHAPING", "同一構圖前後對照：「光線更柔」轉換成真實光源變化。", ["先選想得到的效果", "比對光源大小與陰影邊緣", "需要時再開進階器材參數"]),
            ("取景", "04 / FRAMING", "使用鏡頭、畫面比例與方向完成構圖。", ["先決定比例與橫直幅", "再組合焦段與相機位置", "最後確認對焦、景深與安全範圍"]),
            ("驗證", "05 / VALIDATION", "把曝光與光比問題在交付前排除。", ["檢查曝光與高光剪裁", "比較主光、補光與背景", "通過後再進入成像"]),
            ("拍攝藍圖", "SHOOT BLUEPRINT", "左側把當前拍攝變成可讀的工作摘要。", ["專案與 SHOT 名稱", "鏡位數、畫面比例、焦段", "燈光角色或視覺目標"]),
            ("目前決策", "CURRENT DECISION", "右側先呈現意圖與影響，再提供精確參數。", ["跟隨主光或補光切換", "快捷意圖：更柔、更深、鎖定臉部", "即時回報功率、距離與瞄準"]),
            ("完成與輸出", "FINAL CHECK", "在同一畫面開啟測光分析，輸出前找完技術問題。", ["先看正常畫面，再開疊加分析", "修正後回到正常畫面確認", "儲存場景、備份與燈位工作表"]),
        ],
    },
    "en": {
        "filename": "LUMEN_STAGE_Site_Guide_EN.pdf", "label": "ENGLISH · PRODUCTION UI GUIDE",
        "title": "From decisions to the frame", "subtitle": "Define, block, shape, frame and verify one complete shoot.", "footer": "LUMEN STAGE SITE GUIDE",
        "pages": [
            ("Start here", "START HERE", "Make the large decisions first; open exact equipment controls only when they help.", ["Five-stage header is the main flow", "Shoot Blueprint stays left", "Current Decision stays right"]),
            ("Five-stage workflow", "DECISION FLOW", "Mobile and full mode use the same decision language.", ["Define", "Block", "Shape", "Frame", "Verify"]),
            ("Define", "01 / DEFINE", "Define the intended image before tuning individual controls.", ["Choose reference lighting or a visual style", "Start from an authored setup", "Confirm the Blueprint target"]),
            ("Block", "02 / BLOCKING", "Arrange the subject, lights, modifiers and camera as one spatial system.", ["Studio reveals height and occlusion", "Top view reveals angle and distance", "Use Move, Rotate and Aim"]),
            ("Shape", "03 / SHAPING", "Same-framing comparison: Softer Light becomes a visible source change.", ["Begin with an outcome button", "Compare source size and shadow edge", "Use advanced controls only for exact values"]),
            ("Frame", "04 / FRAMING", "Finish composition with lens, aspect ratio and orientation.", ["Choose aspect and orientation", "Combine focal length with camera position", "Verify focus, depth and safe area"]),
            ("Verify", "05 / VERIFY", "Remove exposure and ratio problems before delivery.", ["Check exposure and highlight clipping", "Compare key, fill and background", "Move to imaging only after it passes"]),
            ("Shoot Blueprint", "SHOOT BLUEPRINT", "The left rail keeps the working brief readable throughout the shoot.", ["Project and SHOT identity", "Shot count, aspect and focal length", "Active light roles or visual target"]),
            ("Selected Decision", "SELECTED DECISION", "The right rail presents intent and impact before exact parameters.", ["Follows the selected light", "Softer, deeper or lock to face", "Reports power, distance and aim"]),
            ("Finish and export", "FINAL CHECK", "Open metering over the same stage and clear technical issues before export.", ["Judge the normal image first", "Return after correcting exposure", "Save, back up and create a setup sheet"]),
        ],
    },
    "ja": {
        "filename": "LUMEN_STAGE_サイトガイド_JA.pdf", "label": "日本語 · 正式版 UI ガイド",
        "title": "意図から完成フレームへ", "subtitle": "方向、配置、光作り、構図、検証の順で撮影を完成。", "footer": "LUMEN STAGE サイトガイド",
        "pages": [
            ("ここから開始", "START HERE", "大きな判断を先に行い、必要なときだけ詳細設定を開きます。", ["上部の 5 段階がメインフロー", "左は撮影ブループリント", "右は現在の判断"]),
            ("5 段階のフロー", "DECISION FLOW", "モバイルとフル版は同じ判断言語を使います。", ["方向", "配置", "光作り", "構図", "検証"]),
            ("方向", "01 / DIRECTION", "個別の設定より先に、作りたい画像を定義します。", ["参照画像かスタイルを選択", "配光の出発点を作成", "撮影ブループリントの目標を確認"]),
            ("配置", "02 / BLOCKING", "人物、ライト、モディファイア、カメラを配置します。", ["高さと遮蔽を確認", "角度と距離を確認", "移動、回転、照射を使用"]),
            ("光作り", "03 / SHAPING", "同じフレーミングの前後比較で柔らかさを確認します。", ["得たい結果から開始", "光源と影の縁を比較", "正確な値にだけ詳細設定"]),
            ("構図", "04 / FRAMING", "レンズ、比率、縦横方向で画面を完成します。", ["比率と方向を先に決定", "焦点距離と位置を調整", "ピントと被写界深度を確認"]),
            ("検証", "05 / VALIDATION", "納品前に露出と光量比の問題を除きます。", ["露出と白飛びを確認", "キー、フィル、背景を比較", "合格後にイメージング"]),
            ("撮影ブループリント", "SHOOT BLUEPRINT", "左レールは撮影中も作業ブリーフを読める状態に保ちます。", ["プロジェクトと SHOT", "ショット数、比率、焦点距離", "光の役割または目標"]),
            ("現在の判断", "CURRENT DECISION", "右レールは正確な値より先に意図と影響を示します。", ["選択した光に追従", "柔らかく、深く、顔に固定", "出力、距離、照射を表示"]),
            ("完了と出力", "FINAL CHECK", "同じステージで測光を開き、出力前に問題を解決します。", ["通常画像を先に判断", "修正後は通常表示へ戻る", "保存、バックアップ、ライト図"]),
        ],
    },
}


def register_fonts():
    pdfmetrics.registerFont(TTFont("UI", "/System/Library/Fonts/STHeiti Light.ttc", subfontIndex=0))
    pdfmetrics.registerFont(TTFont("UI-B", "/System/Library/Fonts/STHeiti Medium.ttc", subfontIndex=0))


def wrap(value, font, size, width):
    lines = []
    for paragraph in value.split("\n"):
        ascii_text = sum(ord(c) < 128 for c in paragraph) > len(paragraph) * .7
        tokens, separator = (paragraph.split(" "), " ") if ascii_text else (list(paragraph), "")
        current = ""
        for token in tokens:
            candidate = token if not current else current + separator + token
            if pdfmetrics.stringWidth(candidate, font, size) <= width:
                current = candidate
            else:
                if current:
                    lines.append(current)
                current = token
        if current:
            lines.append(current)
    return lines


def text(c, value, x, y, size=10, color=INK, bold=False, width=None, leading=None):
    font = "UI-B" if bold else "UI"
    c.setFont(font, size); c.setFillColor(color)
    lines = wrap(value, font, size, width) if width else value.split("\n")
    for line in lines:
        c.drawString(x, y, line); y -= leading or size * 1.45
    return y


def image(c, locale, filename, x, y, w, h, crop=True):
    with Image.open(CAPTURES / locale / filename) as source:
        item = source.convert("RGB")
        draw_x, draw_y, draw_w, draw_h = x, y, w, h
        if crop:
            sr, tr = item.width / item.height, w / h
            if sr > tr:
                nw = round(item.height * tr); left = (item.width - nw) // 2
                item = item.crop((left, 0, left + nw, item.height))
            else:
                nh = round(item.width / tr); top = (item.height - nh) // 2
                item = item.crop((0, top, item.width, top + nh))
        else:
            scale = min(w / item.width, h / item.height)
            draw_w, draw_h = item.width * scale, item.height * scale
            draw_x, draw_y = x + (w - draw_w) / 2, y + (h - draw_h) / 2
        embed_size = (round(draw_w * EMBED_SCALE), round(draw_h * EMBED_SCALE))
        if item.width > embed_size[0] or item.height > embed_size[1]:
            item.thumbnail(embed_size, Image.Resampling.LANCZOS)
        c.setFillColor(PANEL); c.roundRect(x - 5, y - 5, w + 10, h + 10, 8, fill=1, stroke=0)
        c.drawImage(ImageReader(item), draw_x, draw_y, draw_w, draw_h, mask="auto")


def base(c, guide, number, chapter):
    title, kicker, lead, _ = chapter
    c.setFillColor(BG); c.rect(0, 0, W, H, fill=1, stroke=0)
    c.setFillColor(BLUE); c.rect(0, H - 6, W, 6, fill=1, stroke=0)
    text(c, kicker, 36, H - 34, 8, BLUE, True)
    text(c, title, 36, H - 60, 20, INK, True, 755)
    c.setStrokeColor(LINE); c.line(36, H - 75, W - 36, H - 75)
    text(c, lead, 36, H - 96, 9.5, MUTED, False, 755, 13.5)
    text(c, f"{guide['footer']}   {number:02d}", 36, 18, 7.2, MUTED)


def bullets(c, values, x, y, width):
    for value in values:
        c.setFillColor(BLUE); c.circle(x + 3, y + 3, 2.2, fill=1, stroke=0)
        lines = wrap(value, "UI", 8.5, width - 18)
        text(c, "\n".join(lines), x + 14, y + 7, 8.5, INK, False, None, 12.2)
        y -= len(lines) * 12.2 + 8


def cover(c, locale, guide):
    c.setFillColor(BG); c.rect(0, 0, W, H, fill=1, stroke=0)
    image(c, locale, "desktop-00-cover-focus.png", 332, 72, 470, 438)
    c.setFillColor(BG); c.rect(309, 54, 18, 475, fill=1, stroke=0)
    c.setFillColor(BLUE); c.roundRect(42, H - 82, 218, 22, 11, fill=1, stroke=0)
    text(c, guide["label"], 53, H - 76, 8, BG, True)
    text(c, "LUMEN\nSTAGE", 42, H - 128, 36, INK, True, None, 40)
    text(c, guide["title"], 42, H - 235, 23, BLUE, True, 258, 30)
    text(c, guide["subtitle"], 42, H - 307, 11, MUTED, False, 250, 18)
    text(c, "Production UI capture / 2026", 42, 42, 7.5, MUTED)
    c.showPage()


def workflow(c, locale, guide):
    chapter = guide["pages"][1]; base(c, guide, 2, chapter)
    names = ["tone", "blocking", "shaping", "framing", "validation"]
    for index, name in enumerate(names):
        x, y = 54 + index * 149, 160
        image(c, locale, f"mobile-0{index + 1}-{name}.png", x, y, 130, 282, crop=False)
        c.setFillColor(PANEL_2); c.roundRect(x, y - 33, 130, 24, 4, fill=1, stroke=0)
        text(c, f"0{index + 1}", x + 10, y - 25, 8, BLUE, True)
        text(c, chapter[3][index], x + 38, y - 25, 7.4, INK, False, 82)
    c.showPage()


def standard(c, locale, guide, number, filename):
    chapter = guide["pages"][number - 1]; base(c, guide, number, chapter)
    image(c, locale, filename, 36, 87, 592, 370)
    c.setFillColor(PANEL); c.roundRect(648, 87, 150, 370, 8, fill=1, stroke=0)
    text(c, "CHECK", 665, 431, 8, BLUE, True)
    bullets(c, chapter[3], 665, 403, 122)
    c.showPage()


def compare(c, locale, guide):
    chapter = guide["pages"][4]; base(c, guide, 5, chapter)
    image(c, locale, "desktop-03-shaping-before.png", 36, 193, 370, 231)
    image(c, locale, "desktop-03-shaping-after.png", 428, 193, 370, 231)
    for x, label in [(48, "BEFORE"), (440, "AFTER")]:
        c.setFillColor(BG); c.roundRect(x, 376, 62, 22, 4, fill=1, stroke=0)
        text(c, label, x + 9, 383, 7.5, BLUE, True)
    c.setFillColor(PANEL); c.roundRect(36, 77, 762, 92, 8, fill=1, stroke=0)
    for index, note in enumerate(chapter[3]):
        x = 53 + index * 249
        c.setFillColor(BLUE); c.circle(x, 126, 3, fill=1, stroke=0)
        text(c, note, x + 12, 132, 8.4, INK, False, 210, 12)
    c.showPage()


def poppler(name):
    bundled = Path("/Users/clark/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/override") / name
    return str(bundled if bundled.exists() else shutil.which(name))


def render_pages(locale, pdf_path):
    target = PAGES / locale; target.mkdir(parents=True, exist_ok=True)
    for old in [*target.glob("page-*.jpg"), *target.glob("page-*.png")]: old.unlink()
    subprocess.run([poppler("pdftoppm"), "-png", "-r", "300", str(pdf_path), str(target / "page")], check=True)
    for index, source in enumerate(sorted(target.glob("page-*.png")), 1):
        destination = target / f"page-{index:02d}.png"
        if source != destination: source.replace(destination)


def build_pdf(locale, guide):
    path = PUBLIC / guide["filename"]
    c = canvas.Canvas(str(path), pagesize=(W, H), pageCompression=1)
    c.setTitle(f"LUMEN STAGE - {guide['title']}"); c.setAuthor("LUMEN STAGE")
    cover(c, locale, guide); workflow(c, locale, guide)
    standard(c, locale, guide, 3, "desktop-01-tone.png")
    standard(c, locale, guide, 4, "desktop-02-blocking.png")
    compare(c, locale, guide)
    standard(c, locale, guide, 6, "desktop-04-framing.png")
    standard(c, locale, guide, 7, "desktop-05-validation.png")
    standard(c, locale, guide, 8, "desktop-06-shoot-blueprint.png")
    standard(c, locale, guide, 9, "desktop-07-current-decision.png")
    standard(c, locale, guide, 10, "desktop-10-final-check.png")
    c.save(); render_pages(locale, path)
    return path


def main():
    missing = [f"{locale}/{name}" for locale in GUIDES for name in SOURCES if not (CAPTURES / locale / name).exists()]
    if missing: raise FileNotFoundError("Missing production captures: " + ", ".join(missing))
    register_fonts(); PUBLIC.mkdir(parents=True, exist_ok=True); PAGES.mkdir(parents=True, exist_ok=True)
    for old in [*PAGES.glob("page-*.jpg"), *PAGES.glob("page-*.png")]: old.unlink()
    outputs = [build_pdf(locale, guide) for locale, guide in GUIDES.items()]
    for output in outputs: print(output)


if __name__ == "__main__": main()
