from pathlib import Path
import shutil

from PIL import Image
from reportlab.lib.colors import HexColor, white
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "output" / "pdf" / "LUMEN_STAGE_網站使用教學.pdf"
TMP = ROOT / "tmp" / "pdfs"
W, H = landscape(A4)

BG = HexColor("#080B0F")
PANEL = HexColor("#111820")
PANEL_2 = HexColor("#18232C")
INK = HexColor("#EDF2F5")
MUTED = HexColor("#82909B")
LIME = HexColor("#67D8FF")
ORANGE = HexColor("#FFB454")
CYAN = HexColor("#9CCEE0")
LINE = HexColor("#344755")


def register_fonts():
    pdfmetrics.registerFont(TTFont("CJK", "/System/Library/Fonts/STHeiti Light.ttc", subfontIndex=0))
    pdfmetrics.registerFont(TTFont("CJK-B", "/System/Library/Fonts/STHeiti Medium.ttc", subfontIndex=0))


def wrap(s, font, size, width):
    lines, current = [], ""
    for ch in s:
        if ch == "\n":
            lines.append(current); current = ""; continue
        if pdfmetrics.stringWidth(current + ch, font, size) <= width:
            current += ch
        else:
            if current: lines.append(current)
            current = ch
    if current: lines.append(current)
    return lines


def txt(c, s, x, y, size=10, color=INK, font="CJK", width=None, leading=None):
    c.setFont(font, size); c.setFillColor(color)
    lines = wrap(s, font, size, width) if width else s.split("\n")
    leading = leading or size * 1.48
    for line in lines:
        c.drawString(x, y, line); y -= leading
    return y


def base(c, number, title, kicker):
    c.setFillColor(BG); c.rect(0, 0, W, H, fill=1, stroke=0)
    c.setFillColor(LIME); c.rect(0, H - 6, W, 6, fill=1, stroke=0)
    txt(c, kicker, 36, H - 36, 8, LIME, "CJK-B")
    txt(c, title, 36, H - 62, 20, INK, "CJK-B")
    c.setStrokeColor(LINE); c.line(36, H - 76, W - 36, H - 76)
    txt(c, f"LUMEN STAGE 網站使用教學   {number:02d}", 36, 18, 7.5, MUTED)
    return H - 98


def pill(c, label, x, y, fill=LIME, fg=BG, width=None):
    width = width or pdfmetrics.stringWidth(label, "CJK-B", 8) + 18
    c.setFillColor(fill); c.roundRect(x, y - 13, width, 18, 9, fill=1, stroke=0)
    txt(c, label, x + 9, y - 7, 8, fg, "CJK-B")
    return width


def card(c, x, y, w, h, title, body, accent=LIME, tag=None, size=9):
    c.setFillColor(PANEL); c.roundRect(x, y - h, w, h, 10, fill=1, stroke=0)
    c.setFillColor(accent); c.rect(x, y - h, 4, h, fill=1, stroke=0)
    yy = y - 19
    if tag:
        pill(c, tag, x + 14, yy, accent, BG); yy -= 28
    txt(c, title, x + 14, yy, 11.5, INK, "CJK-B", w - 28)
    txt(c, body, x + 14, yy - 22, size, MUTED, "CJK", w - 28, size * 1.5)


def bullet(c, items, x, y, width, size=9, gap=7):
    for item in items:
        c.setFillColor(LIME); c.circle(x + 3, y + 3, 2.2, fill=1, stroke=0)
        lines = wrap(item, "CJK", size, width - 18)
        txt(c, "\n".join(lines), x + 14, y + 7, size, INK, "CJK", None, size * 1.45)
        y -= len(lines) * size * 1.45 + gap
    return y


def table(c, x, y, widths, rows, row_h=34, font_size=8.2):
    total = sum(widths)
    for ri, row in enumerate(rows):
        h = row_h
        c.setFillColor(PANEL_2 if ri == 0 else (PANEL if ri % 2 else HexColor("#151E26")))
        c.rect(x, y - h, total, h, fill=1, stroke=0)
        xx = x
        for ci, value in enumerate(row):
            if ci:
                c.setStrokeColor(LINE); c.line(xx, y - h, xx, y)
            fg = LIME if ri == 0 else INK
            font = "CJK-B" if ri == 0 else "CJK"
            lines = wrap(str(value), font, font_size, widths[ci] - 12)
            yy = y - (h - len(lines) * font_size * 1.35) / 2 - font_size
            txt(c, "\n".join(lines), xx + 6, yy, font_size, fg, font, None, font_size * 1.35)
            xx += widths[ci]
        y -= h
    return y


def image_fit(c, path, x, y, w, h, crop=False):
    img = Image.open(path)
    if crop:
        src_ratio, dst_ratio = img.width / img.height, w / h
        if src_ratio > dst_ratio:
            nw = int(img.height * dst_ratio); left = (img.width - nw) // 2
            img = img.crop((left, 0, left + nw, img.height))
        else:
            nh = int(img.width / dst_ratio); top = (img.height - nh) // 2
            img = img.crop((0, top, img.width, top + nh))
        c.drawImage(ImageReader(img), x, y, w, h, mask="auto")
    else:
        scale = min(w / img.width, h / img.height)
        dw, dh = img.width * scale, img.height * scale
        c.drawImage(ImageReader(img), x + (w - dw) / 2, y + (h - dh) / 2, dw, dh, mask="auto")


def screenshot_frame(c, path, x, y, w, h):
    c.setFillColor(PANEL); c.roundRect(x - 5, y - 5, w + 10, h + 10, 8, fill=1, stroke=0)
    image_fit(c, path, x, y, w, h)


def callout(c, n, x, y, label, side="right"):
    c.setFillColor(LIME); c.circle(x, y, 10, fill=1, stroke=0)
    c.setFillColor(BG); c.setFont("CJK-B", 8); c.drawCentredString(x, y - 3, str(n))
    tw = pdfmetrics.stringWidth(label, "CJK-B", 8) + 14
    lx = x + 13 if side == "right" else x - tw - 13
    c.setFillColor(PANEL_2); c.roundRect(lx, y - 10, tw, 20, 4, fill=1, stroke=0)
    txt(c, label, lx + 7, y - 3, 8, INK, "CJK-B")


def cover(c):
    c.setFillColor(BG); c.rect(0, 0, W, H, fill=1, stroke=0)
    screenshot_frame(c, TMP / "lumen-main.png", 355, 86, 455, 384)
    c.setFillColor(BG); c.rect(325, 58, 24, 440, fill=1, stroke=0)
    pill(c, "繁體中文 · 介面操作手冊", 42, H - 76, LIME, BG, 158)
    txt(c, "LUMEN\nSTAGE", 42, H - 132, 37, INK, "CJK-B", None, 42)
    txt(c, "網站使用教學", 42, H - 238, 25, LIME, "CJK-B")
    txt(c, "從建立場景、調燈、相機取景、\n測光分析到照片渲染與輸出。", 44, H - 286, 12, MUTED, "CJK", 245, 20)
    txt(c, "適用版本：LUMEN STAGE / 001", 42, 44, 8, MUTED)
    c.showPage()


def interface_map(c):
    y = base(c, 1, "先認識主畫面", "INTERFACE MAP")
    screenshot_frame(c, TMP / "lumen-main.png", 36, 73, 770, 433)
    callout(c, 1, 88, 344, "場景物件")
    callout(c, 2, 388, 307, "3D 攝影棚")
    callout(c, 3, 742, 344, "控制面板", "left")
    callout(c, 4, 448, 474, "檢視切換")
    callout(c, 5, 372, 90, "相機參數列")
    callout(c, 6, 697, 91, "鏡位庫")
    c.showPage()


def first_workflow(c):
    y = base(c, 2, "第一次使用：照這個順序完成一張作品", "10-MINUTE WORKFLOW")
    steps = [
        ("01", "選人物與道具", "左側新增人物、椅子、桌子或商品台；點物件即可選取。"),
        ("02", "放置燈光", "按『新增燈』，在棚內或俯視視角移動燈，瞄準主體。"),
        ("03", "調光", "右側設定輸出功率、發光模式、塑光附件、色溫與尺寸。"),
        ("04", "設定相機", "選機身、鏡頭、焦距、光圈、快門、ISO、比例與方向。"),
        ("05", "分析曝光", "開啟『測光分析』，看 EV、直方圖、假色與剪裁警示。"),
        ("06", "渲染輸出", "切到『照片渲染』，等待取樣乾淨後按『輸出 PNG』。"),
    ]
    for i, (num, title, body) in enumerate(steps):
        col, row = i % 3, i // 3
        x, top = 36 + col * 260, y - row * 176
        c.setFillColor(PANEL); c.roundRect(x, top - 148, 242, 148, 10, fill=1, stroke=0)
        txt(c, num, x + 16, top - 24, 10, LIME, "CJK-B")
        txt(c, title, x + 16, top - 51, 13, INK, "CJK-B", 208)
        txt(c, body, x + 16, top - 79, 9.2, MUTED, "CJK", 208, 15)
    card(c, 36, 116, 762, 66, "操作原則", "先處理『位置與角度』，再處理『亮度與顏色』，最後才開照片渲染。預覽模式適合快速調整，渲染模式用於確認成品。", LIME, "避免浪費等待時間", 9.3)
    c.showPage()


def objects(c):
    y = base(c, 3, "場景物件與移動工具", "SCENE BUILDING")
    card(c, 36, y, 242, 157, "左側場景清單", "選擇 Camera、Model、Incident Meter、燈具與附件。Shift + 點擊可多選燈具；雙擊物件可加入收藏；上方搜尋可快速過濾。", CYAN, "選取", 9)
    card(c, 296, y, 242, 157, "新增內容", "可新增燈、人物、椅子、桌子、商品台、方塊、球體，以及反光板、黑旗、V-Flat。也能匯入 GLB / GLTF 人物模型。", LIME, "建立", 9)
    card(c, 556, y, 242, 157, "移動、旋轉、瞄準", "G：移動；R：旋轉；選燈後按 T 進入瞄準。方向鍵微調 0.1m，Shift + 方向鍵為 0.5m；Alt + 上下鍵調高度。", ORANGE, "快捷鍵", 9)
    y -= 180
    rows = [
        ["功能", "怎麼操作", "適用情況"],
        ["俯視燈位", "頂部『俯視燈位』或按 2", "排燈距離、左右位置最清楚"],
        ["棚內視角", "頂部『棚內視角』或按 1", "觀察高度、陰影與遮擋"],
        ["群組", "Shift 多選燈具 → 群組", "整組一起移動或複製"],
        ["鎖定位置", "右側選取物件後按鎖定", "避免誤拖已完成的燈位"],
        ["復原／重做", "左上 ↶ / ↷；⌘Z / ⇧⌘Z", "快速試錯"],
    ]
    table(c, 36, y, [148, 292, 322], rows, 38, 8.8)
    c.showPage()


def lighting(c):
    y = base(c, 4, "燈光控制：從燈具到塑光附件", "LIGHTING")
    screenshot_frame(c, TMP / "lumen-main.png", 36, 177, 474, 267)
    card(c, 532, y, 266, 115, "1. 先選發光模式", "常亮：直接預覽亮度。閃光：依閃燈持續時間與同步速度模擬；快門超過同步限制時會出現警示，可開 HSS。", ORANGE, "常亮 / 閃光", 8.8)
    card(c, 532, y - 130, 266, 115, "2. 再選塑光附件", "柔光箱、柔光傘、美人碟、深口罩、燈籠罩、標準罩等會改變光束、柔硬與溢光。Grid 會收窄光線。", LIME, "OPTIC", 8.8)
    card(c, 532, y - 260, 266, 115, "3. 最後調數值", "輸出功率決定強弱；距離遵守平方反比。尺寸越大、離主體越近通常越柔。色溫／RGB 會影響光色。", CYAN, "POWER / SIZE / COLOR", 8.8)
    txt(c, "實用起點", 36, 147, 12, LIME, "CJK-B")
    bullet(c, ["主燈放人物前方約 45°、略高於眼睛，先調到臉部曝光正確。", "補光燈先比主燈低 1 至 2 級；輪廓燈從人物後側分離背景。", "反光板加亮陰影；黑旗吸光、控制溢光；V-Flat 可當大型補光或負補光。"], 36, 122, 744, 9, 6)
    c.showPage()


def camera(c):
    y = base(c, 5, "相機、鏡頭與構圖設定", "CAMERA")
    rows = [
        ["設定", "在網站中影響", "建議用法"],
        ["機身 / 感光元件", "視角、像素、動態範圍、雜訊、讀出速度", "需要真實相機特性時選對型號"],
        ["鏡頭 / 焦距", "視角、壓縮感、光學暗角與變形", "人像 50-85mm；環境 24-35mm"],
        ["光圈", "曝光與景深", "先用 f/4；需要淺景深再開大"],
        ["快門", "曝光、動態模糊、閃燈同步", "人物先 1/125-1/250；動作更快"],
        ["ISO", "亮度與感光元件雜訊模擬", "先 100；亮度不足再提高"],
        ["對焦距離", "清晰平面與景深範圍", "可跟隨人物臉／胸／全身，或手動設定"],
        ["比例 / 方向", "取景框與最終 PNG 裁切", "3:2、4:5、1:1、16:9；橫幅或直幅"],
    ]
    table(c, 36, y, [135, 318, 309], rows, 39, 8.4)
    card(c, 36, 166, 371, 88, "取景輔助", "相機取景（3）可開三分法、黃金比例或安全框；景深預覽顯示模糊效果，焦點提示會顯示 AF-S、距離與景深。", LIME, None, 8.8)
    card(c, 427, 166, 371, 88, "光學與感光元件模擬", "光學模擬包含暗角、變形、色差與呼吸效應；感光元件模擬包含動態範圍、降噪、色彩雜訊、動態模糊與 rolling shutter。", CYAN, None, 8.8)
    c.showPage()


def exposure(c):
    y = base(c, 6, "測光分析：用數據校正曝光", "EXPOSURE SCOPE")
    screenshot_frame(c, TMP / "lumen-camera-analysis.png", 36, 151, 490, 276)
    card(c, 548, y, 250, 102, "直方圖", "亮度模式看整體明暗；RGB 模式可發現單一色頻道先爆掉。右側貼邊代表高光剪裁，左側貼邊代表暗部失去細節。", LIME, None, 8.7)
    card(c, 548, y - 116, 250, 102, "假色 / 剪裁警示", "假色把曝光區域用顏色分類；剪裁警示直接標出過曝區。調燈或相機後回到原始畫面確認視覺效果。", ORANGE, None, 8.7)
    card(c, 548, y - 232, 250, 102, "入射式測光探針", "可移到主角臉、胸口、其他人物或背景，也能在 3D 場景手動移動。讀值包含 EV，適合比較主燈與背景。", CYAN, None, 8.7)
    card(c, 36, 127, 762, 62, "單燈貢獻", "在測光面板把某盞燈設為 SOLO，可單獨檢查它對畫面的貢獻；完成後按『全部燈光』恢復。這是排查溢光與陰影最有效的功能之一。", LIME, "推薦", 9)
    c.showPage()


def shots(c):
    y = base(c, 7, "鏡位庫與燈位工作表", "SHOT MANAGEMENT")
    card(c, 36, y, 242, 145, "擷取目前鏡位", "按右下『＋ SHOT』或鏡位庫中的『擷取目前鏡位』，會保存目前相機、燈光、人物、背景與畫面縮圖。", LIME, "建立版本", 9)
    card(c, 296, y, 242, 145, "載入與覆寫", "『載入』回到已存鏡位；『覆寫』用目前設定更新。可直接修改名稱。重要版本先新增一個 Shot，避免覆寫。", CYAN, "比較方案", 9)
    card(c, 556, y, 242, 145, "燈位工作表", "可從頂欄或特定 Shot 開啟。工作表包含俯視燈位、器材清單與相機設定，可切換紙本／深色並輸出 PNG 或列印 PDF。", ORANGE, "交付現場", 9)
    y -= 174
    txt(c, "建議命名方式", 36, y, 13, INK, "CJK-B")
    rows = [
        ["名稱範例", "代表內容", "適合用途"],
        ["A01_Key45_Soft", "A 機第一版，45° 柔光主燈", "基準版本"],
        ["A02_Key45_Fill-2", "補光比主燈低 2 級", "對照光比"],
        ["B01_Rim_Warm", "B 機位，暖色輪廓光", "另一構圖／氣氛"],
        ["Product_Hero_Final", "商品主視覺定稿", "交付與工作表"],
    ]
    table(c, 36, y - 24, [210, 315, 237], rows, 38, 8.7)
    c.showPage()


def render(c):
    y = base(c, 8, "照片渲染與 PNG 輸出", "PATH TRACING")
    screenshot_frame(c, TMP / "lumen-render.png", 36, 177, 474, 267)
    card(c, 532, y, 266, 92, "開始渲染", "按『照片渲染』或 4。系統切到高品質路徑追蹤，SPP 會逐步增加，畫面雜訊隨取樣減少。", LIME, "4", 8.7)
    card(c, 532, y - 105, 266, 92, "暫停 / 重新取樣", "Space 暫停或繼續；Shift + R 重新取樣。燈光、相機或材質變更後通常需要重新累積。", CYAN, "SPP", 8.7)
    card(c, 532, y - 210, 266, 92, "輸出 PNG", "至少有 1 SPP 後即可輸出。成品會依畫面比例與方向裁切，並套用解析度、降噪、鏡頭、色彩與感光元件效果。", ORANGE, "1080P / 2K / 4K", 8.7)
    card(c, 532, y - 315, 266, 92, "何時算完成？", "預覽可在 32-64 SPP 判斷；正式輸出等待邊緣與陰影區不再明顯閃爍。反光材質與暗場通常需要更多取樣。", LIME, "品質判斷", 8.7)
    txt(c, "輸出前檢查：比例與方向 → 對焦 → 高光剪裁 → 色溫 → 解析度 → Live Denoise。", 36, 143, 10, INK, "CJK-B", 750)
    c.showPage()


def pro(c):
    y = base(c, 9, "PRO 控制台：進階製作功能", "PRODUCTION CONSOLE")
    screenshot_frame(c, TMP / "lumen-pro.png", 36, 178, 430, 242)
    rows = [
        ["區塊", "功能"],
        ["拍攝模式", "PHOTO / CINEMA；電影模式可調 FPS、快門角度、T-stop、ND、變形寬銀幕"],
        ["多相機", "新增相機槽、切換機位、更新目前機位"],
        ["攝影棚", "棚寬／深／高、牆地顏色、窗戶、太陽方位高度與霧化"],
        ["人物追蹤", "頭部與眼睛看向相機"],
        ["動畫時間軸", "加入關鍵影格、播放燈光與相機變化"],
        ["專業資產", "匯入 HDRI、IES、GLB"],
        ["輸出與效能", "快速／平衡／Ultra、1080P／2K／4K、Live Denoise、Storyboard、合併專案"],
    ]
    table(c, 486, y, [92, 220], rows, 39, 7.5)
    card(c, 36, 139, 762, 66, "使用時機", "基本棚拍先在主介面完成；需要電影參數、多機位、自然光、動畫、HDRI／IES 或高解析度交付時再打開 PRO。快捷鍵 P 可開關。", LIME, "避免介面過載", 9)
    c.showPage()


def project_shortcuts(c):
    y = base(c, 10, "專案存檔與常用快捷鍵", "SAVE & SHORTCUTS")
    card(c, 36, y, 242, 135, "儲存場景", "按右上『儲存場景』或 ⌘S，寫入目前瀏覽器。本機存檔適合持續編輯，但不等於可攜式備份。", LIME, "瀏覽器本機", 9)
    card(c, 296, y, 242, 135, "匯出專案檔", "『檔案 → 匯出專案檔』或 ⌘E，下載 JSON。換電腦、交接、版本備份時應使用此方式。", CYAN, "可攜備份", 9)
    card(c, 556, y, 242, 135, "匯入 / 合併", "匯入專案檔會開啟保存場景；PRO 中的『合併專案』可把另一份專案內容併入目前工作。", ORANGE, "協作", 9)
    y -= 160
    rows = [
        ["按鍵", "功能", "按鍵", "功能"],
        ["1 / 2 / 3 / 4", "棚內 / 俯視 / 取景 / 渲染", "G / R / T", "移動 / 旋轉 / 燈光瞄準"],
        ["M", "測光分析", "P", "PRO 控制台"],
        ["B", "鏡位庫", "?", "完整快捷鍵說明"],
        ["Space", "暫停／繼續渲染", "Shift + R", "重新取樣"],
        ["⌘S / ⌘E", "儲存 / 匯出專案", "⌘Z / ⇧⌘Z", "復原 / 重做"],
        ["方向鍵", "微移 0.1m", "Shift + 方向鍵", "微移 0.5m"],
        ["Esc", "關閉面板／取消瞄準", "Shift + 點擊", "多選燈具"],
    ]
    table(c, 36, y, [112, 249, 130, 271], rows, 36, 8.4)
    c.showPage()


def practice(c):
    y = base(c, 11, "練習任務：做出一張柔光人像", "GUIDED PRACTICE")
    tasks = [
        ("1", "建立", "保留 Model，新增一盞燈，選柔光箱；刪除或關閉其他燈。"),
        ("2", "定位", "切到俯視燈位（2），把主燈放在人物前方 45°；棚內視角（1）把燈抬高。"),
        ("3", "瞄準", "選主燈按 T，把照射目標放到人物胸口；再回到移動模式。"),
        ("4", "調光", "輸出功率由低往高調；色溫先 5600K，柔光箱尺寸約 90×90cm。"),
        ("5", "相機", "相機取景（3）；50-85mm、f/4、1/125s、ISO 100，開眼睛／人物追蹤。"),
        ("6", "測光", "按 M，把探針移到主角臉；檢查直方圖與剪裁警示，微調主燈輸出。"),
        ("7", "保存", "按『＋ SHOT』命名為 Portrait_Key45，並產生燈位工作表。"),
        ("8", "輸出", "按 4，等待畫面乾淨；PRO 選 2K 與 Live Denoise，最後輸出 PNG。"),
    ]
    for i, (n, title, body) in enumerate(tasks):
        col, row = i % 2, i // 2
        x, top = 36 + col * 390, y - row * 96
        c.setFillColor(PANEL); c.roundRect(x, top - 79, 372, 79, 9, fill=1, stroke=0)
        c.setFillColor(LIME); c.circle(x + 24, top - 39, 13, fill=1, stroke=0)
        c.setFillColor(BG); c.setFont("CJK-B", 9); c.drawCentredString(x + 24, top - 42, n)
        txt(c, title, x + 49, top - 25, 11, INK, "CJK-B")
        txt(c, body, x + 49, top - 46, 8.7, MUTED, "CJK", 305, 13)
    card(c, 36, 120, 762, 61, "完成標準", "人物眼睛清楚、臉部沒有剪裁、主燈方向明確、陰影仍有細節、背景與人物有分離，並保存 Shot、專案 JSON 與最終 PNG。", LIME, "CHECK", 9)
    c.showPage()


def build():
    register_fonts(); OUT.parent.mkdir(parents=True, exist_ok=True)
    required = [TMP / "lumen-main.png", TMP / "lumen-camera-analysis.png", TMP / "lumen-pro.png", TMP / "lumen-render.png"]
    missing = [str(p) for p in required if not p.exists()]
    if missing: raise FileNotFoundError("Missing screenshots: " + ", ".join(missing))
    c = canvas.Canvas(str(OUT), pagesize=(W, H), pageCompression=1)
    c.setTitle("LUMEN STAGE 網站使用教學")
    c.setAuthor("OpenAI Codex")
    for fn in [cover, interface_map, first_workflow, objects, lighting, camera, exposure, shots, render, pro, project_shortcuts]:
        fn(c)
    c.save()
    public_pdf = ROOT / "public" / "LUMEN_STAGE_網站使用教學.pdf"
    public_pdf.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(OUT, public_pdf)
    print(OUT)


if __name__ == "__main__": build()
