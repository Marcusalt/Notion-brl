import { Client } from "@notionhq/client";

const notion = new Client({ auth: process.env.NOTION_TOKEN });
const DATABASE_ID = process.env.NOTION_DATABASE_ID;

async function getUsdBrl() {
  const res = await fetch("https://economia.awesomeapi.com.br/json/last/USD-BRL");
  const data = await res.json();
  const bid = Number(data?.USDBRL?.bid);
  if (!bid || Number.isNaN(bid)) throw new Error("Cotação inválida");
  return bid;
}

function todayIsoDate() {
  // Data “do dia” (GitHub Actions roda em UTC, mas para o seu uso normalmente serve)
  return new Date().toISOString().slice(0, 10);
}

async function queryFilteredPages() {
  let results = [];
  let cursor = undefined;

  const filter = {
    and: [
      {
        or: [
          { property: "Status", status: { equals: "Lucro" } },
          { property: "Status", status: { equals: "Prejuízo" } }
        ]
      },
      {
        or: [
          { property: "Ganho", number: { greater_than: 0 } },
          { property: "Perda", number: { greater_than: 0 } }
        ]
      }
    ]
  };

  while (true) {
    const resp = await notion.databases.query({
      database_id: DATABASE_ID,
      filter,
      start_cursor: cursor,
      page_size: 100
    });

    results = results.concat(resp.results);
    if (!resp.has_more) break;
    cursor = resp.next_cursor;
  }

  return results;
}

async function updatePage(pageId, usdBrl, dateIso) {
  await notion.pages.update({
    page_id: pageId,
    properties: {
      "Cotação USD/BRL (dia)": { number: usdBrl },
      "Data da Cotação": { date: { start: dateIso } }
    }
  });
}

async function main() {
  const usdBrl = await getUsdBrl();
  const dateIso = todayIsoDate();

  const pages = await queryFilteredPages();

  for (const p of pages) {
    await updatePage(p.id, usdBrl, dateIso);
  }

  console.log(`OK: atualizado ${pages.length} páginas | USD/BRL=${usdBrl} | data=${dateIso}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
