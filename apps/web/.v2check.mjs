import { chromium } from 'playwright'
const exe = process.argv[2]
const browser = await chromium.launch({ headless: true, executablePath: exe })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, locale: 'zh-CN' })
await page.goto('http://127.0.0.1:3080/', { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForTimeout(6000)
const info = await page.evaluate(() => {
  const headline = document.querySelector('[class*="headlineText"]')
  const greeting = document.querySelector('[class*="greeting"]')
  const fish = document.querySelector('[class*="fishHitbox"] svg')
  const hints = document.querySelectorAll('[class*="hints"] span')
  const cs = (el) => el ? getComputedStyle(el).fontSize : null
  return {
    greeting: greeting?.textContent ?? null,
    greetingSize: cs(greeting),
    headline: headline?.textContent ?? null,
    headlineSize: cs(headline),
    fishWidth: fish ? fish.getBoundingClientRect().width : null,
    hintCount: hints.length,
    hintSize: hints[0] ? getComputedStyle(hints[0]).fontSize : null,
  }
})
console.log(JSON.stringify(info, null, 2))
await browser.close()
