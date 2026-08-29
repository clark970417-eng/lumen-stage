"""Build the English and Japanese LUMEN STAGE guides and web page images.

The Traditional Chinese guide remains the canonical original.  This builder
keeps the two translated editions structurally identical and exports each PDF
to both output/pdf and public, plus browser-ready JPEG pages.
"""

from pathlib import Path
import shutil
import subprocess

from reportlab.lib.colors import HexColor
from reportlab.lib.pagesizes import A4, landscape
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas


ROOT = Path(__file__).resolve().parents[1]
W, H = landscape(A4)
BG = HexColor("#080B0F")
PANEL = HexColor("#111820")
PANEL_ALT = HexColor("#18232C")
INK = HexColor("#EDF2F5")
MUTED = HexColor("#82909B")
LIME = HexColor("#67D8FF")
CYAN = HexColor("#9CCEE0")
ORANGE = HexColor("#FFB454")
LINE = HexColor("#344755")


GUIDES = {
    "en": {
        "filename": "LUMEN_STAGE_Site_Guide_EN.pdf",
        "label": "ENGLISH · INTERFACE GUIDE",
        "title": "Site guide",
        "subtitle": "Build a scene, shape light, frame the camera, check exposure and render the final image.",
        "version": "For LUMEN STAGE / 001",
        "footer": "LUMEN STAGE SITE GUIDE",
        "pages": [
            ("INTERFACE MAP", "Know the workspace", "One stage, three working zones. Select on the left, work in 3D, then refine on the right.", [
                ("Scene library", "Add and select cameras, people, lights, grip and set objects. Shift-click selects multiple lights."),
                ("3D studio", "Move, rotate and aim directly in the studio. Switch among studio, top-plan and camera views."),
                ("Inspector", "Tune the selected light, subject, camera or grip item without leaving the scene."),
            ], ["Top bar: project, view mode and guide", "Bottom HUD: lens, aperture, shutter, ISO and scene EV", "Shot Library stores alternate setups"]),
            ("10-MINUTE WORKFLOW", "Your first finished image", "Work from large decisions to small ones. Position first, exposure second, rendering last.", [
                ("01 · Build", "Add a person and any chair, table or plinth needed for the composition."),
                ("02 · Light", "Add a light, place it around 45° from the subject and aim it at the chest or face."),
                ("03 · Shape", "Choose a softbox, umbrella or reflector; then set power, size and color."),
                ("04 · Camera", "Choose body and lens, then set focal length, aperture, shutter, ISO and framing."),
                ("05 · Measure", "Open Exposure Analysis to check EV, histogram, false color and clipping."),
                ("06 · Render", "Enter Photo Render, let samples settle and export the final PNG."),
            ], ["Preview mode is for fast decisions", "Render mode is for final validation"]),
            ("SCENE BUILDING", "Objects and transform tools", "The object list and 3D gizmos work together. Select an item before using a transform shortcut.", [
                ("Move · G", "Drag the colored axes. Arrow keys nudge 0.1 m; Shift + arrows nudge 0.5 m."),
                ("Rotate · R", "Rotate people, grip and set objects. Locked items cannot be moved accidentally."),
                ("Aim · T", "With a light selected, drag its target or lock it to a subject's face, chest or full body."),
            ], ["1 Studio view: judge height and shadows", "2 Top plan: judge distance and left/right placement", "Undo and redo support quick experiments"]),
            ("LIGHTING", "From lamp to light shaper", "A believable setup depends on source power, modifier geometry, distance and direction together.", [
                ("Emission", "Use Continuous for live feedback or Flash for duration, sync-speed and HSS behavior."),
                ("Modifier", "Softbox, umbrellas, beauty dish, parabolic, lantern, Fresnel and projection optics shape the beam."),
                ("Control", "Power sets strength. A larger, closer source is softer. Grid, flags and V-Flats control spill."),
            ], ["Start the key light 45° off-axis and slightly above eye level", "Keep fill one or two stops below the key", "Use RGB only when colored light is intentional"]),
            ("CAMERA", "Camera, lens and composition", "Treat the virtual camera like a real one: perspective comes from camera position and focal length together.", [
                ("Lens", "50–85 mm is a useful portrait range; 24–35 mm includes more environment. Lens profiles add optical character."),
                ("Exposure", "Start near f/4, 1/125 s and ISO 100. Keep flash shutter speed inside the sync limit unless HSS is on."),
                ("Focus", "Set focus distance manually or track a subject zone. Use depth preview and focus assist to verify sharpness."),
            ], ["Choose 3:2, 4:5, 1:1 or 16:9", "Switch between landscape and portrait", "Composition guides affect preview, not lighting"]),
            ("EXPOSURE SCOPE", "Measure before you render", "Use analysis overlays to find technical problems while changes are still fast.", [
                ("Histogram", "The left edge is deep shadow and the right edge is highlight. RGB mode reveals channel clipping."),
                ("False color", "Maps exposure zones to colors. Clipping warning marks areas that have lost highlight detail."),
                ("Meter probe", "Place the incident probe on a face, chest, another subject or the backdrop and compare EV readings."),
            ], ["Solo one light to understand its contribution", "Return to All Lights after troubleshooting", "Judge the normal image after using overlays"]),
            ("SHOT MANAGEMENT", "Shots and setup sheets", "Save meaningful alternatives instead of rebuilding a setup from memory.", [
                ("Capture", "+ SHOT stores the current camera, lights, people, backdrop and a thumbnail."),
                ("Load or overwrite", "Load returns to a saved version. Overwrite replaces it with the current setup."),
                ("Setup sheet", "Generate a top-plan diagram, equipment list and camera settings for print or handoff."),
            ], ["Name versions by camera, light angle and intent", "Example: A02_Key45_Fill-2", "Create a new Shot before risky changes"]),
            ("PATH TRACING", "Photo render and PNG export", "Progressive sampling replaces the fast viewport with a higher-quality light simulation.", [
                ("Start", "Choose Photo Render or press 4. SPP rises while visible noise gradually decreases."),
                ("Control", "Space pauses or resumes. Shift + R restarts sampling after a scene change."),
                ("Export", "After at least 1 SPP, export PNG with the chosen crop, resolution, optics, color and sensor effects."),
            ], ["32–64 SPP is often enough to evaluate", "Dark and reflective scenes usually need more samples", "Check focus, clipping and color temperature before export"]),
            ("PRODUCTION CONSOLE", "Advanced production tools", "Open PRO only when the shoot needs cinema parameters, multiple cameras, environments or advanced output.", [
                ("Capture", "PHOTO / CINEMA, FPS, shutter angle, T-stop, ND and anamorphic controls."),
                ("Stage", "Multiple camera slots, studio dimensions, window, sun, haze and subject look-at tracking."),
                ("Pipeline", "HDRI, IES and GLB imports; quality and resolution presets; timeline, storyboard and project merge."),
            ], ["Press P to open or close PRO", "Finish the basic studio setup first", "Use Live Denoise for cleaner previews"]),
            ("SAVE & SHORTCUTS", "Projects and essential keys", "Browser saves are convenient; exported project files are the portable backup.", [
                ("Save", "Save Scene or ⌘S writes the current project to this browser."),
                ("Export", "File → Export Project or ⌘E downloads a JSON file for backup and transfer."),
                ("Import / merge", "Import opens another project. Merge Project in PRO combines it with the current scene."),
            ], ["1 / 2 / 3 / 4 · studio / top / camera / render", "G / R / T · move / rotate / aim", "M · exposure   B · shots   P · PRO", "⌘Z / ⇧⌘Z · undo / redo   Esc · close or cancel"]),
        ],
    },
    "ja": {
        "filename": "LUMEN_STAGE_サイトガイド_JA.pdf",
        "label": "日本語 · インターフェースガイド",
        "title": "サイトガイド",
        "subtitle": "シーン作成、ライティング、カメラ設定、露出確認から最終レンダリングまで。",
        "version": "LUMEN STAGE / 001 対応",
        "footer": "LUMEN STAGE サイトガイド",
        "pages": [
            ("INTERFACE MAP", "メイン画面を理解する", "左で選択、中央の 3D で配置、右で詳細調整。3 つのエリアで撮影を組み立てます。", [
                ("シーンライブラリ", "カメラ、人物、ライト、グリップ、セットを追加・選択。Shift + クリックでライトを複数選択できます。"),
                ("3D スタジオ", "スタジオ、俯瞰図、ファインダーを切り替え、移動・回転・照射を直接操作します。"),
                ("インスペクター", "選択中のライト、人物、カメラ、グリップの設定をシーンを離れず調整します。"),
            ], ["上部：プロジェクト、表示モード、ガイド", "下部 HUD：レンズ、絞り、シャッター、ISO、シーン EV", "ショットライブラリで別案を保存"]),
            ("10-MINUTE WORKFLOW", "最初の一枚を完成させる", "大きな判断から細部へ。配置、露出、レンダリングの順に進めます。", [
                ("01 · 構築", "人物を追加し、構図に必要な椅子、テーブル、展示台を配置します。"),
                ("02 · 配光", "ライトを追加して人物の約 45° 前方に置き、胸元または顔へ向けます。"),
                ("03 · 成形", "ソフトボックス、アンブレラ、レフ板を選び、出力・サイズ・色を設定します。"),
                ("04 · カメラ", "ボディとレンズを選び、焦点距離、絞り、シャッター、ISO、フレーミングを設定します。"),
                ("05 · 測光", "露出分析で EV、ヒストグラム、フォルスカラー、白飛びを確認します。"),
                ("06 · 出力", "フォトレンダリングを開始し、サンプルが安定したら PNG を書き出します。"),
            ], ["プレビューは素早い調整用", "レンダーは最終確認用"]),
            ("SCENE BUILDING", "オブジェクトと変形ツール", "オブジェクトを選択してから、3D ギズモまたはショートカットで操作します。", [
                ("移動 · G", "カラー軸をドラッグ。矢印キーは 0.1 m、Shift + 矢印キーは 0.5 m 移動します。"),
                ("回転 · R", "人物、グリップ、セットを回転。ロックすると完成した配置の誤操作を防げます。"),
                ("照射 · T", "ライト選択時に照射点を動かすか、人物の顔・胸元・全身へ追従させます。"),
            ], ["1 スタジオ：高さ、影、遮蔽を確認", "2 俯瞰図：距離と左右位置を確認", "元に戻す／やり直すで素早く比較"]),
            ("LIGHTING", "ライトとシェーパー", "出力、モディファイア形状、距離、方向を組み合わせてリアルな光を作ります。", [
                ("発光モード", "定常光はリアルタイム確認、フラッシュは閃光時間、同調速度、HSS を再現します。"),
                ("モディファイア", "ソフトボックス、アンブレラ、ビューティーディッシュ、パラボリック、フレネルなどで光束を成形します。"),
                ("コントロール", "出力は光量、近く大きい光源ほど柔らかく、グリッドやフラッグは漏れ光を抑えます。"),
            ], ["キーライトは人物の 45° 前方、目線より少し高く", "フィルはキーより 1-2 段低く", "RGB は色光を意図するときだけ使用"]),
            ("CAMERA", "カメラ、レンズ、構図", "実機と同じく、パースはカメラ位置と焦点距離の組み合わせで決まります。", [
                ("レンズ", "人物は 50〜85 mm、環境を含めるなら 24〜35 mm。プロファイルで光学特性も再現します。"),
                ("露出", "まず f/4、1/125 秒、ISO 100。フラッシュでは HSS 以外は同調速度内にします。"),
                ("フォーカス", "距離を手動設定するか人物エリアへ追従。被写界深度とフォーカスアシストで確認します。"),
            ], ["3:2、4:5、1:1、16:9 から選択", "横位置／縦位置を切り替え", "構図ガイドは照明には影響しません"]),
            ("EXPOSURE SCOPE", "レンダー前に露出を測る", "変更が速い段階で分析表示を使い、技術的な問題を見つけます。", [
                ("ヒストグラム", "左端は暗部、右端はハイライト。RGB 表示では各チャンネルのクリップを確認できます。"),
                ("フォルスカラー", "露出領域を色分けし、白飛び警告でハイライトのディテール消失を示します。"),
                ("測光プローブ", "顔、胸元、別の人物、背景へ置き、EV を比較して光量比を整えます。"),
            ], ["SOLO で各ライトの寄与を確認", "確認後は「すべてのライト」に戻す", "最後に通常画像で見た目を判断"]),
            ("SHOT MANAGEMENT", "ショットとライト図", "意味のある別案を保存し、記憶だけでセットを作り直さないようにします。", [
                ("取り込み", "+ SHOT でカメラ、ライト、人物、背景、サムネイルを保存します。"),
                ("読み込み／上書き", "読み込みで保存状態へ戻り、上書きで現在の設定に置き換えます。"),
                ("ライト図", "俯瞰配置、機材リスト、カメラ設定を作成し、印刷や引き継ぎに使えます。"),
            ], ["カメラ、角度、意図が分かる名前を付ける", "例：A02_Key45_Fill-2", "大きな変更前は新しい Shot を作成"]),
            ("PATH TRACING", "フォトレンダーと PNG", "プログレッシブサンプリングで、高品質な光シミュレーションへ切り替えます。", [
                ("開始", "フォトレンダリングまたは 4。SPP が増えるほどノイズが減少します。"),
                ("操作", "Space で一時停止／再開、Shift + R でシーン変更後に再サンプリングします。"),
                ("書き出し", "1 SPP 以上で、比率、解像度、光学、色、センサー効果を反映した PNG を出力します。"),
            ], ["評価は 32〜64 SPP が目安", "暗部や反射材はより多くのサンプルが必要", "出力前にピント、白飛び、色温度を確認"]),
            ("PRODUCTION CONSOLE", "高度な制作機能", "シネマ設定、複数カメラ、環境、詳細出力が必要なときに PRO を開きます。", [
                ("撮影", "PHOTO / CINEMA、FPS、シャッター角、T-stop、ND、アナモフィック。"),
                ("スタジオ", "複数カメラ、スタジオ寸法、窓、太陽、霧、人物の視線追従。"),
                ("パイプライン", "HDRI、IES、GLB、品質・解像度、タイムライン、ストーリーボード、プロジェクト結合。"),
            ], ["P で PRO を開閉", "基本セットを先に完成させる", "Live Denoise でプレビューを整理"]),
            ("SAVE & SHORTCUTS", "プロジェクトと基本キー", "ブラウザ保存は手軽、書き出したプロジェクトファイルは持ち運べるバックアップです。", [
                ("保存", "「シーンを保存」または ⌘S で現在のプロジェクトをブラウザに保存します。"),
                ("書き出し", "ファイル → プロジェクトを書き出す、または ⌘E で JSON をダウンロードします。"),
                ("読み込み／結合", "読み込みは別プロジェクトを開き、PRO の結合は現在のシーンへ追加します。"),
            ], ["1 / 2 / 3 / 4 · スタジオ / 俯瞰 / カメラ / レンダー", "G / R / T · 移動 / 回転 / 照射", "M · 露出   B · ショット   P · PRO", "⌘Z / ⇧⌘Z · 元に戻す / やり直す   Esc · 閉じる"]),
        ],
    },
}


PRACTICE_PAGES = {
    "en": (
        "GUIDED PRACTICE", "Build a soft-light portrait", "Finish this exercise once and the full LUMEN STAGE workflow will make sense.", [
            ("01 · Build", "Keep one subject, add one light and choose a softbox. Turn off any other lights."),
            ("02 · Position", "In Top Plan (2), place the key around 45° in front. In Studio (1), raise it above eye level."),
            ("03 · Aim", "Select the key and press T. Aim at the chest, then return to Move mode."),
            ("04 · Shape", "Start at 5600 K with a 90 × 90 cm softbox. Increase power from low to high."),
            ("05 · Camera", "Use Camera (3), 50–85 mm, f/4, 1/125 s and ISO 100. Focus on the eyes."),
            ("06 · Measure", "Press M, place the probe on the face and check the histogram and clipping warning."),
            ("07 · Save", "Capture + SHOT as Portrait_Key45, save the scene and export a project backup."),
            ("08 · Export", "Press 4, wait for clean edges and shadows, then export the final PNG."),
        ], ["Success: sharp eyes, no facial clipping, clear light direction, shadow detail and backdrop separation", "Leave with a Shot, project backup and final PNG"]
    ),
    "ja": (
        "GUIDED PRACTICE", "柔らかなポートレートを作る", "この練習を一度完了すると、LUMEN STAGE の基本ワークフローを理解できます。", [
            ("01 · 構築", "人物を一人残し、ライトを一灯追加してソフトボックスを選択。他のライトはオフにします。"),
            ("02 · 配置", "俯瞰図（2）で人物の前方 45°、スタジオ（1）で目線より高く配置します。"),
            ("03 · 照射", "キーライトを選び T。胸元へ向けてから移動モードへ戻します。"),
            ("04 · 成形", "5600 K、90 × 90 cm のソフトボックスから開始し、出力を低い値から上げます。"),
            ("05 · カメラ", "カメラ（3）で 50〜85 mm、f/4、1/125 秒、ISO 100。目にピントを合わせます。"),
            ("06 · 測光", "M を押し、顔へプローブを置いてヒストグラムと白飛び警告を確認します。"),
            ("07 · 保存", "+ SHOT を Portrait_Key45 として保存し、シーン保存とバックアップ書き出しを行います。"),
            ("08 · 出力", "4 を押し、輪郭と影が安定したら最終 PNG を書き出します。"),
        ], ["完成基準：目が鮮明、顔に白飛びがなく、光の方向が明確で、影と背景の分離が残っている", "Shot、プロジェクトバックアップ、最終 PNG を保存"]
    ),
}

SAVE_PAGES = {
    "en": (
        "SAVE, BACK UP & SHARE", "Keep the project safe", "A browser save is convenient, a project file is portable, and a share link is for review.", [
            ("Save on this device", "Save Scene or ⌘S keeps the project in this browser. Clearing site data or changing devices can remove it."),
            ("Export a backup", "Use File → Export Project on desktop, or Export Backup in the mobile Project tab. Download one before handoff or major changes."),
            ("Share the scene", "The mobile Project tab can copy a link containing the scene settings. Send it only to people you trust."),
        ], ["1 / 2 / 3 / 4 · studio / top / camera / render", "G / R / T · move / rotate / aim", "M · exposure   B · shots   P · PRO", "⌘S / ⌘E · save / export   ? · open this guide"]
    ),
    "ja": (
        "SAVE, BACK UP & SHARE", "プロジェクトを安全に残す", "ブラウザ保存は手軽、プロジェクトファイルは持ち運び用、共有リンクは確認用です。", [
            ("この端末に保存", "「シーンを保存」または ⌘S でこのブラウザに保存。サイトデータの消去や端末変更で失われる場合があります。"),
            ("バックアップを書き出す", "デスクトップはファイル → 書き出し、モバイルはプロジェクトタブ。引き継ぎや大きな変更前に保存します。"),
            ("シーンを共有", "モバイルのプロジェクトタブでシーン設定を含むリンクをコピー。信頼できる相手とのみ共有します。"),
        ], ["1 / 2 / 3 / 4 · スタジオ / 俯瞰 / カメラ / レンダー", "G / R / T · 移動 / 回転 / 照射", "M · 露出   B · ショット   P · PRO", "⌘S / ⌘E · 保存 / 書き出し   ? · このガイド"]
    ),
}

# Put the outcome-driven quick start before the interface tour and keep the
# advanced PRO chapter out of the concise ten-page guide.
for language, guide in GUIDES.items():
    pages = guide["pages"]
    guide["pages"] = [pages[1], pages[0], *pages[2:8], SAVE_PAGES[language]]


def register_fonts():
    pdfmetrics.registerFont(TTFont("UI", "/System/Library/Fonts/STHeiti Light.ttc", subfontIndex=0))
    pdfmetrics.registerFont(TTFont("UI-B", "/System/Library/Fonts/STHeiti Medium.ttc", subfontIndex=0))


def wrap(text, font, size, width):
    ascii_ratio = sum(ord(character) < 128 for character in text) / max(1, len(text))
    if ascii_ratio > 0.72 and " " in text:
        lines = []
        for paragraph in text.split("\n"):
            current = ""
            for word in paragraph.split(" "):
                candidate = word if not current else f"{current} {word}"
                if pdfmetrics.stringWidth(candidate, font, size) <= width:
                    current = candidate
                else:
                    if current: lines.append(current)
                    current = word
            if current: lines.append(current)
        return lines
    lines, current = [], ""
    for character in text:
        if character == "\n":
            lines.append(current); current = ""; continue
        if pdfmetrics.stringWidth(current + character, font, size) <= width:
            current += character
        else:
            if current: lines.append(current)
            current = character
    if current: lines.append(current)
    return lines


def text(c, value, x, y, size=10, color=INK, bold=False, width=None, leading=None):
    font = "UI-B" if bold else "UI"
    c.setFont(font, size); c.setFillColor(color)
    lines = wrap(value, font, size, width) if width else value.split("\n")
    leading = leading or size * 1.48
    for line in lines:
        c.drawString(x, y, line); y -= leading
    return y


def pill(c, value, x, y, color=LIME):
    width = pdfmetrics.stringWidth(value, "UI-B", 7.5) + 18
    c.setFillColor(color); c.roundRect(x, y - 13, width, 18, 9, fill=1, stroke=0)
    text(c, value, x + 9, y - 7, 7.5, BG, True)


def background(c, footer, number):
    c.setFillColor(BG); c.rect(0, 0, W, H, fill=1, stroke=0)
    c.setFillColor(LIME); c.rect(0, H - 6, W, 6, fill=1, stroke=0)
    text(c, f"{footer}   {number:02d}", 36, 18, 7.2, MUTED)


def cover(c, guide):
    background(c, guide["footer"], 0)
    c.setFillColor(PANEL); c.roundRect(405, 77, 360, 405, 18, fill=1, stroke=0)
    c.setStrokeColor(LINE); c.setLineWidth(1)
    for x in range(441, 751, 62): c.line(x, 104, x, 452)
    for y in range(112, 453, 57): c.line(431, y, 740, y)
    c.setStrokeColor(LIME); c.setLineWidth(5)
    c.line(450, 157, 619, 377); c.line(619, 377, 714, 227)
    c.setFillColor(CYAN); c.circle(619, 377, 13, fill=1, stroke=0)
    c.setFillColor(ORANGE); c.circle(450, 157, 10, fill=1, stroke=0)
    pill(c, guide["label"], 42, H - 76)
    text(c, "LUMEN\nSTAGE", 42, H - 132, 37, INK, True, leading=42)
    text(c, guide["title"], 42, H - 238, 25, LIME, True, width=320)
    text(c, guide["subtitle"], 44, H - 286, 11.5, MUTED, width=315, leading=19)
    text(c, guide["version"], 42, 44, 8, MUTED)
    c.showPage()


def content_page(c, guide, number, page):
    kicker, title, intro, cards, notes = page
    background(c, guide["footer"], number)
    text(c, kicker, 36, H - 36, 8, LIME, True)
    text(c, title, 36, H - 62, 20, INK, True, width=760)
    c.setStrokeColor(LINE); c.line(36, H - 76, W - 36, H - 76)
    text(c, intro, 36, H - 100, 10, MUTED, width=755, leading=15)

    columns = 2 if len(cards) >= 7 else (3 if len(cards) <= 3 else 2)
    gap = 18
    card_width = (762 - gap * (columns - 1)) / columns
    rows = (len(cards) + columns - 1) // columns
    top = H - 147
    card_height = 78 if len(cards) >= 7 else (120 if rows == 1 else (96 if rows >= 3 else 114))
    row_gap = 10 if len(cards) >= 7 else (12 if rows >= 3 else 16)
    accents = [LIME, CYAN, ORANGE, LIME, CYAN, ORANGE]
    for index, (heading, body) in enumerate(cards):
        col, row = index % columns, index // columns
        x = 36 + col * (card_width + gap)
        y = top - row * (card_height + row_gap)
        c.setFillColor(PANEL if index % 2 == 0 else PANEL_ALT)
        c.roundRect(x, y - card_height, card_width, card_height, 11, fill=1, stroke=0)
        c.setFillColor(accents[index % len(accents)]); c.roundRect(x, y - card_height, 4, card_height, 2, fill=1, stroke=0)
        text(c, heading, x + 16, y - 25, 11, INK, True, width=card_width - 32)
        text(c, body, x + 16, y - 53, 8.5, MUTED, width=card_width - 32, leading=13.1)

    notes_top = top - rows * (card_height + row_gap) - 8
    text(c, "CHECK", 36, notes_top, 8, LIME, True)
    for index, note in enumerate(notes):
        y = notes_top - 25 - index * 25
        c.setFillColor(LIME); c.circle(40, y + 3, 2.2, fill=1, stroke=0)
        text(c, note, 51, y + 7, 8.8, INK, width=735, leading=12)
    c.showPage()


def build_one(locale, guide):
    output_dir = ROOT / "output" / "pdf"
    output_dir.mkdir(parents=True, exist_ok=True)
    output_pdf = output_dir / guide["filename"]
    c = canvas.Canvas(str(output_pdf), pagesize=(W, H), pageCompression=1)
    c.setTitle(f"LUMEN STAGE {guide['title']}")
    c.setAuthor("OpenAI Codex")
    cover(c, guide)
    for number, page in enumerate(guide["pages"], 1): content_page(c, guide, number, page)
    c.save()

    public_pdf = ROOT / "public" / guide["filename"]
    shutil.copy2(output_pdf, public_pdf)
    pages_dir = ROOT / "public" / "guide-pages" / locale
    pages_dir.mkdir(parents=True, exist_ok=True)
    for existing_page in pages_dir.glob("page-*.jpg"):
        existing_page.unlink()
    prefix = pages_dir / "page"
    pdftoppm = Path("/Users/clark/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/override/pdftoppm")
    subprocess.run([str(pdftoppm), "-jpeg", "-r", "130", "-jpegopt", "quality=88", str(output_pdf), str(prefix)], check=True)
    for index, source in enumerate(sorted(pages_dir.glob("page-*.jpg")), 1):
        target = pages_dir / f"page-{index:02d}.jpg"
        if source != target: source.replace(target)
    return output_pdf


def main():
    register_fonts()
    zh_dir = ROOT / "public" / "guide-pages" / "zh"
    zh_dir.mkdir(parents=True, exist_ok=True)
    for existing_page in zh_dir.glob("page-*.jpg"):
        existing_page.unlink()
    for source in sorted((ROOT / "public" / "guide-pages").glob("page-*.jpg")):
        shutil.copy2(source, zh_dir / source.name)
    for locale, guide in GUIDES.items(): print(build_one(locale, guide))


if __name__ == "__main__": main()
