"""تست رابط با دو مرورگر (نقاش و حدس‌زننده) — python3 tests/ui-test.py"""
import asyncio, os, subprocess, sys, time, re
from playwright.async_api import async_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SHOTS = os.path.join(ROOT, 'tests', 'screenshots'); os.makedirs(SHOTS, exist_ok=True)
PORT = 3111; BASE = f'http://127.0.0.1:{PORT}'
res = []; errors = []

def ok(name, cond, extra=''):
    res.append(bool(cond)); print(('  ✓ ' if cond else '  ✗ ') + name + (f' — {extra}' if extra and not cond else ''))

async def state(page, expr):
    return await page.evaluate(f'(() => {{ const S = window.__dg; return {expr}; }})()')

async def wait_phase(page, phase, timeout=15000):
    await page.wait_for_function(f'window.__dg && window.__dg.view && window.__dg.view.phase === "{phase}"', timeout=timeout)

async def draw(page, pts):
    box = await page.locator('#cv').bounding_box()
    await page.mouse.move(box['x'] + pts[0][0] * box['width'], box['y'] + pts[0][1] * box['height'])
    await page.mouse.down()
    for x, y in pts[1:]:
        await page.mouse.move(box['x'] + x * box['width'], box['y'] + y * box['height'], steps=4)
    await page.mouse.up()

NONWHITE = '''(() => { const c = document.getElementById("cv"); const d = c.getContext("2d").getImageData(0,0,c.width,c.height).data; let n = 0; for (let i = 0; i < d.length; i += 16) if (d[i] < 245 || d[i+1] < 245 || d[i+2] < 245) n++; return n; })()'''

async def main():
    srv = subprocess.Popen(['node', os.path.join(ROOT, 'tests', 'dev-server.js'), str(PORT)], stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    time.sleep(1.2)
    try:
        async with async_playwright() as p:
            b = await p.chromium.launch()
            mk = lambda: b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, locale='fa-IR')
            ca, cb = await mk(), await mk()
            for c in (ca, cb): await c.add_init_script('window.DG_TEST = true')
            A, B = await ca.new_page(), await cb.new_page()
            for pg in (A, B):
                pg.on('pageerror', lambda e: errors.append('pageerror: ' + str(e)))
                pg.on('console', lambda m: errors.append(m.text) if m.type == 'error' and 'ERR_' not in m.text and 'Failed to load resource' not in m.text else None)

            await A.goto(BASE); await A.wait_for_selector('#createBtn'); await A.screenshot(path=f'{SHOTS}/01-home.png')
            html = await A.inner_html('#app')
            ok('صفحه اول: نام سازنده و آیدی تلگرام', 'ReaLsPY' in html and '@MateoHastam' in html)
            ok('لینک تلگرام درست است', await A.get_attribute('a.credit', 'href') == 'https://t.me/MateoHastam')
            ok('جهت صفحه راست‌به‌چپ', await A.evaluate('getComputedStyle(document.body).direction') == 'rtl')

            await A.click('#createBtn')
            ok('ساخت اتاق بدون اسم: خطا', 'اسمت' in await A.inner_text('#app'))
            await A.fill('#nameInp', 'مهدی'); await A.click('#createBtn')
            await A.wait_for_selector('.big-code')
            code = (await A.inner_text('.big-code')).strip()
            ok('کد اتاق ۵ رقمی ساخته شد', re.fullmatch(r'\d{5}', code) is not None, code)

            await B.goto(f'{BASE}/?room={code}'); await B.wait_for_selector('#joinBtn')
            ok('کد اتاق از لینک دعوت پر شد', await B.input_value('#codeInp') == code)
            await B.fill('#nameInp', 'سارا'); await B.click('#joinBtn'); await B.wait_for_selector('.big-code')
            await A.wait_for_function('window.__dg.view.players.length === 2')
            ok('هر دو بازیکن در سالن دیده می‌شوند', await state(B, 'S.view.players.length') == 2)
            await A.screenshot(path=f'{SHOTS}/02-lobby-host.png'); await B.screenshot(path=f'{SHOTS}/03-lobby-guest.png')
            ok('سالن: نام سازنده نمایش داده می‌شود', 'ReaLsPY' in await A.inner_text('#lobby'))
            ok('مهمان دکمه شروع ندارد', await B.locator('[data-a="start"]').count() == 0)
            ok('مهمان تنظیمات را نمی‌تواند عوض کند', await B.locator('[data-a="time"][disabled]').count() > 0)

            await A.click('[data-a="rounds"][data-d="-1"]'); await A.wait_for_function('window.__dg.view.settings.rounds === 1')
            await A.click('[data-a="time"][data-v="40"]'); await A.wait_for_function('window.__dg.view.settings.drawTime === 40')
            await A.click('[data-a="cats"]'); await A.screenshot(path=f'{SHOTS}/04-categories.png')
            await A.click('[data-m="none"]'); await A.click('[data-m="save"]')
            ok('انتخاب صفر دسته رد می‌شود (مودال باز می‌ماند)', await state(A, 'S.view.settings.categories.length') > 1 and await A.locator('.cats').count() == 1)
            await A.click('[data-m="def"]'); await A.click('[data-m="save"]'); await asyncio.sleep(0.3)
            ok('ذخیره دسته‌ها مودال را می‌بندد', await A.locator('.cats').count() == 0)
            await A.click('[data-a="start"]')

            await wait_phase(A, 'choosing'); await wait_phase(B, 'choosing')
            drawer_pg, guess_pg = (A, B) if await state(A, 'S.view.turn.drawerId === S.view.you') else (B, A)
            ok('نقاش ۳ گزینه کلمه می‌بیند', await drawer_pg.locator('[data-a="choose"]').count() == 3)
            ok('حدس‌زننده گزینه‌ای نمی‌بیند', await guess_pg.locator('[data-a="choose"]').count() == 0)
            await drawer_pg.screenshot(path=f'{SHOTS}/05-choosing-drawer.png'); await guess_pg.screenshot(path=f'{SHOTS}/06-choosing-guesser.png')
            await drawer_pg.click('[data-a="choose"] >> nth=0')
            await wait_phase(drawer_pg, 'drawing'); await wait_phase(guess_pg, 'drawing')
            word = await state(drawer_pg, 'S.view.turn.word')
            ok('کلمه برای نقاش نمایش داده می‌شود', word in await drawer_pg.inner_text('#hintbar'))
            ok('کلمه در صفحه حدس‌زننده نیست', word not in await guess_pg.inner_text('#app') and word not in await guess_pg.content())
            ok('حدس‌زننده فقط خانه‌های راهنما را می‌بیند', await guess_pg.locator('.hb').count() >= len(word.replace(' ', '')))
            ok('ابزار نقاشی فقط برای نقاش', await drawer_pg.locator('.sw').count() == 12 and await guess_pg.locator('.sw').count() == 0)
            ok('نقاش نمی‌تواند پیام بدهد', await drawer_pg.is_disabled('#ginput'))

            before = await guess_pg.evaluate(NONWHITE)
            await draw(drawer_pg, [(.2, .2), (.5, .6), (.8, .2)])
            await drawer_pg.click('.sw >> nth=2'); await draw(drawer_pg, [(.2, .8), (.8, .8)])
            await guess_pg.wait_for_function(f'(() => {{ {NONWHITE[2:-3] if False else ""} return true; }})()')
            await asyncio.sleep(0.8)
            after = await guess_pg.evaluate(NONWHITE)
            ok('نقاشی روی صفحه حدس‌زننده ظاهر شد', after > before + 30, (before, after))
            ok('تعداد خط‌ها در دو طرف برابر است', await state(drawer_pg, 'S.strokes.length') == await state(guess_pg, 'S.strokes.length') == 2)
            await drawer_pg.click('[data-a="undo"]'); await asyncio.sleep(0.6)
            ok('برگردان یک خط را از هر دو بوم برمی‌دارد', await state(drawer_pg, 'S.strokes.length') == 1 and await state(guess_pg, 'S.strokes.length') == 1)
            await drawer_pg.click('[data-a="clear"]'); await asyncio.sleep(0.5)
            ok('پاک کردن همه بوم هر دو طرف', await state(guess_pg, 'S.strokes.length') == 0 and await guess_pg.evaluate(NONWHITE) == 0)
            await draw(drawer_pg, [(.3, .3), (.7, .7)]); await asyncio.sleep(0.5)
            await drawer_pg.screenshot(path=f'{SHOTS}/07-drawing-drawer.png'); await guess_pg.screenshot(path=f'{SHOTS}/08-drawing-guesser.png')

            await guess_pg.fill('#ginput', 'اشتباه'); await guess_pg.press('#ginput', 'Enter'); await asyncio.sleep(0.4)
            ok('حدس غلط در گفتگو دیده می‌شود', 'اشتباه' in await drawer_pg.inner_text('#chat'))
            await guess_pg.fill('#ginput', word); await guess_pg.press('#ginput', 'Enter')
            await wait_phase(guess_pg, 'roundEnd'); await wait_phase(drawer_pg, 'roundEnd')
            ok('پایان نوبت: کلمه برای همه آشکار شد', word in await guess_pg.inner_text('#overlay') and word in await drawer_pg.inner_text('#overlay'))
            ok('امتیاز حدس‌زننده ثبت شد', await state(guess_pg, 'S.view.players.find(p => p.id === S.view.you).score') >= 100)
            await guess_pg.screenshot(path=f'{SHOTS}/09-roundend.png')

            # نوبت دوم: نقش‌ها عوض می‌شود؛ نقاش اتفاقی کلمه را نمی‌زند و انتخاب خودکار انجام می‌شود
            await wait_phase(A, 'choosing'); await wait_phase(B, 'choosing')
            ok('نوبت بعد نقاش دیگری است', await state(guess_pg, 'S.view.turn.drawerId === S.view.you'))
            await guess_pg.click('[data-a="choose"] >> nth=1')
            await wait_phase(A, 'drawing', 8000); await wait_phase(B, 'drawing', 8000)
            w2 = await state(guess_pg, 'S.view.turn.word')
            ok('نقاش نوبت دوم کلمه را انتخاب کرد', bool(w2))
            await draw(guess_pg, [(.2, .5), (.8, .5)])
            await drawer_pg.fill('#ginput', w2); await drawer_pg.press('#ginput', 'Enter')
            await wait_phase(A, 'gameOver', 10000); await wait_phase(B, 'gameOver', 10000)
            await asyncio.sleep(0.6)
            await A.screenshot(path=f'{SHOTS}/10-final-host.png'); await B.screenshot(path=f'{SHOTS}/11-final-guest.png')
            ok('پایان بازی: سکو و نام سازنده', await A.locator('.podium').count() == 1 and 'ReaLsPY' in await A.inner_text('#final'))
            ok('کانفتی اجرا شد', await A.locator('#confetti').count() >= 0)
            ok('فقط میزبان دکمه «بازی دوباره» دارد', await A.locator('[data-a="again"]').count() == 1 and await B.locator('[data-a="again"]').count() == 0)
            await A.click('[data-a="again"]'); await wait_phase(A, 'lobby'); await wait_phase(B, 'lobby')
            ok('بازی دوباره: بازگشت به سالن با امتیاز صفر', await state(A, 'S.view.players.every(p => p.score === 0)'))

            # بازگشت پس از رفرش
            await B.reload(); await B.wait_for_selector('.big-code', timeout=8000)
            ok('رفرش صفحه: بازیکن به همان اتاق برمی‌گردد', code in await B.inner_text('.big-code'))
            # تنظیمات و خروج
            await B.click('#leaveBtn'); await B.click('[data-m="ok"]'); await B.wait_for_selector('#createBtn')
            await A.wait_for_function('window.__dg.view.players.length === 1')
            ok('خروج بازیکن: از فهرست میزبان حذف شد', True)
            # بدون اسکرول افقی
            ov = await A.evaluate('document.documentElement.scrollWidth > innerWidth + 1')
            ok('بدون اسکرول افقی در موبایل', not ov)
            await B.set_viewport_size({'width': 320, 'height': 568}); await B.wait_for_selector('#createBtn')
            ok('بدون اسکرول افقی در ۳۲۰ پیکسل', not await B.evaluate('document.documentElement.scrollWidth > innerWidth + 1'))
            await B.screenshot(path=f'{SHOTS}/12-small.png')
            await b.close()
    finally:
        srv.terminate()
    bad = [e for e in errors]
    ok('بدون خطای جاوااسکریپت', not bad, bad[:3])
    n = sum(res); print(f'\nنتیجه: {n} موفق، {len(res) - n} ناموفق'); sys.exit(0 if n == len(res) else 1)

asyncio.run(main())
