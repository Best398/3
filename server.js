const express = require('express');
const puppeteer = require('puppeteer');
const cors = require('cors');

const app = express();
app.use(cors());

// Парсер Winline
async function parseWinline() {
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  await page.goto('https://winline.ru/stavki ', { waitUntil: 'networkidle2' });

  const data = await page.evaluate(() => {
    const matches = [];
    document.querySelectorAll('.sport-event').forEach(el => {
      const event = el.querySelector('.event-name')?.innerText.trim();
      const outcomes = Array.from(el.querySelectorAll('.outcome')).map(o => ({
        name: o.querySelector('.outcome-name')?.innerText.trim(),
        coefficient: parseFloat(o.querySelector('.outcome-coef')?.innerText.trim())
      }));
      if (event && outcomes.length > 0) {
        matches.push({ event, source: 'winline', outcomes });
      }
    });
    return matches;
  });

  await browser.close();
  return data;
}

// Логика поиска вилок
function findArbitrages(dataList) {
  const mergedEvents = {};

  dataList.forEach(matchList => {
    matchList.forEach(match => {
      if (!mergedEvents[match.event]) {
        mergedEvents[match.event] = {
          event: match.event,
          outcomes: {}
        };
      }

      match.outcomes.forEach(outcome => {
        if (!mergedEvents[match.event].outcomes[outcome.name]) {
          mergedEvents[match.event].outcomes[outcome.name] = {};
        }
        mergedEvents[match.event].outcomes[outcome.name][match.source] = outcome.coefficient;
      });
    });
  });

  const arbitrageList = [];

  Object.values(mergedEvents).forEach(eventData => {
    const uniqueOutcomes = Object.entries(eventData.outcomes);
    const total = uniqueOutcomes.reduce((sum, [_, coefs]) => {
      const maxCoeff = Math.max(...Object.values(coefs));
      return sum + 1 / maxCoeff;
    }, 0);

    if (total < 1) {
      arbitrageList.push({
        event: eventData.event,
        outcomes: uniqueOutcomes.map(([name, coefs]) => ({
          name,
          ...coefs
        })),
        profit: ((1 - total) * 100).toFixed(2)
      });
    }
  });

  return arbitrageList;
}

// API endpoint
app.get('/api/arbitrage', async (req, res) => {
  try {
    const winline = await parseWinline();
    const opportunities = findArbitrages([winline]);
    res.json(opportunities);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Ошибка при получении данных' });
  }
});

// Статическая раздача HTML
app.use(express.static('public'));

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});