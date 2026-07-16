#!/usr/bin/env python3
import json
from pathlib import Path

package_path = Path('package.json')
package = json.loads(package_path.read_text(encoding='utf-8'))
check = 'node --check src/server/editor-ad-rollout.js'
if check not in package['scripts']['check']:
    package['scripts']['check'] += f' && {check}'
package_path.write_text(json.dumps(package, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

privacy_path = Path('public/privacy.html')
privacy = privacy_path.read_text(encoding='utf-8')
needle = 'برای ادیتور، Origin جداگانه نیز شرط فعال‌شدن است. جایگاه‌ها با برچسب «تبلیغات» مشخص‌اند و پاپ‌آپ، Refresh خودکار، کلیک اجباری یا تبلیغ روی دکمه‌های خروجی استفاده نمی‌شود.'
replacement = needle + ' برای rollout مرحله‌ای، یک Cookie عملکردی و HttpOnly با نام <code>nemodara_editor_ads_bucket</code> حداکثر ۳۰ روز نگه‌داری می‌شود. این مقدار فقط یک عدد تصادفی بین صفر تا ۹۹ است، دادهٔ شخصی یا متن نمودار ندارد، به اسکریپت ناشر داده نمی‌شود و فقط تعیین می‌کند فضای تبلیغ از همان HTML اولیه نمایش داده شود یا نه.'
if needle in privacy and 'nemodara_editor_ads_bucket' not in privacy:
    privacy = privacy.replace(needle, replacement, 1)
privacy_path.write_text(privacy, encoding='utf-8')

readme_path = Path('README_FA.md')
readme = readme_path.read_text(encoding='utf-8')
needle = 'Publisher Script در Origin جداگانهٔ `ads.nemodara.ir` اجرا می‌شود و به متن Mermaid دسترسی ندارد.'
replacement = needle + ' تخصیص rollout روی سرور و پیش از رندر HTML انجام می‌شود تا گروه خارج از آزمایش دچار جمع‌شدن جایگاه و CLS نشود.'
if needle in readme and 'تخصیص rollout روی سرور' not in readme:
    readme = readme.replace(needle, replacement, 1)
readme_path.write_text(readme, encoding='utf-8')

print('Editor rollout metadata and privacy disclosure finalized.')
