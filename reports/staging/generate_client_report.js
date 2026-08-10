const fs = require('fs');
const XLSX = require('xlsx');
const path = require('path');

// 1. CONFIGURATION
const BASE_URL = 'https://staging2.benchmarksystems.com'; // Pointing to your Staging site
const CSV_FILE = 'ci-result.csv';
const OUTPUT_FILE = 'bms_PageSpeed_Report.xlsx';
const HTML_REPORTS_DIR = './official-reports';
const API_KEY = 'AIzaSyBR4dMK1Duo10FQyTgvrqZIe3hs-0K54nk'; 

// Ensure the directory for frozen HTML reports exists
if (!fs.existsSync(HTML_REPORTS_DIR)){
    fs.mkdirSync(HTML_REPORTS_DIR);
}

// Helper: Pause execution
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Helper: Capitalize first letter
const capitalize = (str) => str.charAt(0).toUpperCase() + str.slice(1);

/**
 * Fetches PageSpeed Insights scores, handles Rate Limits, and saves frozen HTML reports
 */
async function getPageSpeedData(fullUrl, strategy, retries = 3, delayMs = 5000) {
  // Requesting all categories explicitly to avoid getting 0s
  const categories = '&category=performance&category=accessibility&category=best-practices&category=seo';
  let apiUrl = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(fullUrl)}&strategy=${strategy}${categories}&key=${API_KEY}`;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await fetch(apiUrl);

      // Handle Rate Limiting (429)
      if (response.status === 429) {
        console.warn(`  [!] Rate limited (429) on ${strategy}. Waiting ${delayMs / 1000}s before retry (Attempt ${attempt}/${retries})...`);
        await sleep(delayMs);
        delayMs *= 2; 
        continue;
      }

      if (!response.ok) {
        console.log(`  [!] Failed to fetch ${strategy} for ${fullUrl} (Status: ${response.status})`);
        return null;
      }

      const data = await response.json();
      
      // --- FROZEN HTML SNAPSHOT GENERATION (Lighthouse v11+ Compatible) ---
      if (data.lighthouseResult) {
        let safeName = fullUrl.replace(BASE_URL, '').replace(/[^a-z0-9]/gi, '_').toLowerCase();
        if (safeName === '_' || safeName === '') safeName = 'homepage';
        
        // Append '-desktop' or '-mobile' to the filename
        safeName = `${safeName}-${strategy}`;
        
        try {
          // Native dynamic import for Lighthouse v11 ESM package
          const lighthouse = await import('lighthouse');
          
          // Locate the generator function (handles various internal exports)
          const generateReport = lighthouse.generateReport || (lighthouse.default && lighthouse.default.generateReport);
          
          if (generateReport) {
            const htmlReport = generateReport(data.lighthouseResult, 'html');
            fs.writeFileSync(path.join(HTML_REPORTS_DIR, `${safeName}.html`), htmlReport);
          } else {
            console.warn(`  [!] Could not locate generateReport in the lighthouse module.`);
          }
        } catch (err) {
          console.error(`  [!] Failed to generate HTML report for ${safeName}:`, err.message);
        }
      }
      // -------------------------------------------------------------------

      const catData = data.lighthouseResult?.categories || {};

      return {
        [`${capitalize(strategy)} Performance`]: Math.round((catData.performance?.score || 0) * 100),
        [`${capitalize(strategy)} Accessibility`]: Math.round((catData.accessibility?.score || 0) * 100),
        [`${capitalize(strategy)} Best Practices`]: Math.round((catData['best-practices']?.score || 0) * 100),
        [`${capitalize(strategy)} SEO`]: Math.round((catData.seo?.score || 0) * 100)
      };

    } catch (error) {
      console.error(`  [!] Error fetching ${strategy}:`, error.message);
      if (attempt === retries) return null;
      await sleep(delayMs);
    }
  }

  return null;
}

async function run() {
  if (!fs.existsSync(CSV_FILE)) {
    console.error(`Error: Could not find ${CSV_FILE} in the current directory.`);
    process.exit(1);
  }

  console.log(`Reading routes from ${CSV_FILE}...`);
  const workbook = XLSX.readFile(CSV_FILE);
  const sheetName = workbook.SheetNames[0];
  const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);

  const routes = rows.map((row) => row.URL || row.url).filter(Boolean);
  console.log(`Found ${routes.length} routes. Starting PageSpeed Insights scan for Staging...\n`);

  const reportData = [];

  for (let i = 0; i < routes.length; i++) {
    const route = routes[i];
    const fullUrl = `${BASE_URL}${route}`;
    const liveReportLink = `https://pagespeed.web.dev/analysis?url=${encodeURIComponent(fullUrl)}`;

    console.log(`Scanning (${i + 1}/${routes.length}): ${fullUrl}`);

    const rowData = {
      'Page Path': route,
      'Desktop Performance': null,
      'Desktop Accessibility': null,
      'Desktop Best Practices': null,
      'Desktop SEO': null,
      'Mobile Performance': null,
      'Mobile Accessibility': null,
      'Mobile Best Practices': null,
      'Mobile SEO': null,
      'Live Google Report Link': liveReportLink,
      'Full URL': fullUrl
    };

    // 1. Fetch Desktop Scores & Generate HTML Snapshot
    const desktopScores = await getPageSpeedData(fullUrl, 'desktop');
    if (desktopScores) Object.assign(rowData, desktopScores);

    await sleep(1500); // Buffer to respect API limits

    // 2. Fetch Mobile Scores & Generate HTML Snapshot
    const mobileScores = await getPageSpeedData(fullUrl, 'mobile');
    if (mobileScores) Object.assign(rowData, mobileScores);

    reportData.push(rowData);
    await sleep(2000); // Buffer before the next URL
  }

  console.log('\nScan complete! Writing Excel spreadsheet...');

  const newSheet = XLSX.utils.json_to_sheet(reportData);
  const newWorkbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(newWorkbook, newSheet, 'PageSpeed Scores');

  XLSX.writeFile(newWorkbook, OUTPUT_FILE);
  console.log(`\nSuccess! Client report saved as: ${OUTPUT_FILE}`);
  console.log(`Success! Frozen HTML reports saved in: ${HTML_REPORTS_DIR}`);
}

run();