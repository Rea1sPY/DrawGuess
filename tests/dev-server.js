/* سرور آزمایشی با زمان‌های کوتاه برای تست رابط:  node tests/dev-server.js 3111 */
'use strict';
const { start } = require('../server.js');
start(Number(process.argv[2]) || 3111, { cfg: { chooseMs: 20000, roundEndMs: 3000, drawerGoneMs: 5000, drawTimes: [5, 40, 60, 80] } });
