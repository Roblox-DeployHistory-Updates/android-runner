const { google } = require('googleapis');
const details = process.env.APP_OUTPUT;
const manifest = JSON.parse(require('fs').readFileSync('manifest.json', 'utf8'));

function formatDate(dateString) {
    const months = {
        Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06',
        Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12'
    };
    const [month, day, year] = dateString.split(/[\s,]+/);
    return `${months[month]}/${day.padStart(2, '0')}/${year}`;
}

(async () => {
  const auth = new google.auth.GoogleAuth({
    credentials: JSON.parse(process.env.GOOGLE_CREDENTIALS),
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  const sheets = google.sheets({ version: 'v4', auth: await auth.getClient() });

  const spreadsheetId = '1nTPDx9n4kfaprq0kZBzRVxshfbOdmw_V3SmvRYxSp0U';

  const values = [[
    details.match(/version name:\s*(.+)/i)[1].trim(),
    details.match(/version code:\s*(.+)/i)[1].trim(),
    formatDate(details.match(/updated on:\s*(.+)/i)[1].trim()),
    'Yes',
    manifest.minSdk ? `API ${manifest.minSdk}` : '',
    manifest.targetSdk ? `API ${manifest.targetSdk}` : '',
    '',
    'https://archive.org/download/com.roblox.client-' + details.match(/version code:\s*(.+)/i)[1].trim() + '/',
    JSON.stringify({
      iconMd5: manifest.iconMd5 || '',
      architectures: manifest.architectures || []
    })
  ]];

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: 'Roblox',
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    resource: {
      values
    },
  });
  

  console.log('Row appended.');
})();