const XLSX = require('xlsx');
const fs = require('fs');

const workbook = XLSX.readFile('bms_PageSpeed_Report.xlsx');
const data = XLSX.utils.sheet_to_json(workbook.Sheets['PageSpeed Scores']);
fs.writeFileSync('staging_data.json', JSON.stringify(data, null, 2));
console.log('Converted Staging Excel to staging_data.json!');