const fs = require('fs');
const path = require('path');

function getReportFolders(dir, folderList = []) {
  const items = fs.readdirSync(dir);
  
  // If this folder has a lighthouse report, add it to the list
  if (items.includes('lighthouse.json')) {
    let relativePath = path.relative('reports', dir).replace(/\\/g, '/');
    if (relativePath === '.') relativePath = '';
    folderList.push(relativePath);
  }

  for (const item of items) {
    // Ignore screenshot folders and Mac system folders
    if (item === '__screenshot-thumbnails__' || item === '__MACOSX') continue;
    
    const fullPath = path.join(dir, item);
    if (fs.statSync(fullPath).isDirectory()) {
      getReportFolders(fullPath, folderList);
    }
  }
  return folderList;
}

const folders = getReportFolders('reports');
fs.writeFileSync('reports-list.json', JSON.stringify(folders, null, 2));
console.log(`Success! Generated reports-list.json with ${folders.length} reports.`);