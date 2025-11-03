const https = require('https');
const xml2js = require('xml2js');

// Available Mensa locations in Hamburg
const MENSA_LOCATIONS = {
  studierendenhaus: 'Schweinemensa',
  blattwerk: 'Blattwerk (Vegetarisch)',
  philturm: 'Philturm'
};

const BASE_URL = 'https://cvzi.github.io/mensahd/feed';
const META_URL = 'https://cvzi.github.io/mensahd/meta';
const TIMEZONE = 'Europe/Berlin';
const NOTE_LABELS = [
  {
    label: 'Vegan',
    patterns: [/vegan/i]
  },
  {
    label: 'Vegetarisch',
    patterns: [/vegetar/i]
  },
  {
    label: 'Rindfleisch',
    patterns: [/\brind\b/i, /\brindfleisch\b/i]
  },
  {
    label: 'Schweinefleisch',
    patterns: [/\bschwein\b/i, /\bschweinefleisch\b/i]
  },
  {
    label: 'Geflügel',
    patterns: [/\bhuhn\b/i, /\bhähnchen\b/i, /\bhaehnchen\b/i, /\bhähnchenfleisch\b/i, /\bhaehnchenfleisch\b/i, /\bgeflügel\b/i, /\bgefluegel\b/i, /\bpute\b/i, /\bputenfleisch\b/i, /\bhühnchen\b/i, /\bhuehnchen\b/i]
  },
  {
    label: 'Laktosefrei',
    patterns: [/laktosefrei/i, /enthält keine laktose/i, /enthaelt keine laktose/i]
  },
  {
    label: 'Wild',
    patterns: [/\bwild\b/i, /\bhirsch\b/i, /\breh\b/i, /\bwildschwein\b/i]
  },
  {
    label: 'Lammfleisch',
    patterns: [/\blamm\b/i, /\blammfleisch\b/i]
  },
  {
    label: 'Fisch',
    patterns: [/\bfisch\b/i, /\blachs\b/i, /\bforelle\b/i, /\bseelachs\b/i, /\blachsfilet\b/i, /\bscholle\b/i, /\btilapia\b/i, /\bhering\b/i, /\bmakrele\b/i, /\bdorsch\b/i]
  },
  {
    label: 'Gelatine',
    patterns: [/gelatine/i, /gelatin/i]
  },
  {
    label: 'Alkohol',
    patterns: [/\balkohol\b/i, /\bwein\b/i, /\bliqueur\b/i, /\blikör\b/i, /\bschnaps\b/i, /\brum\b/i, /\bwhisky\b/i, /\bwhiskey\b/i, /\bweinbrand\b/i]
  }
];

function getBerlinDate(date = new Date()) {
  const berlinDate = new Date(date.toLocaleString('en-US', { timeZone: TIMEZONE }));
  const year = berlinDate.getFullYear();
  const month = String(berlinDate.getMonth() + 1).padStart(2, '0');
  const day = String(berlinDate.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function isBerlinWeekend(date = new Date()) {
  const berlinDate = new Date(date.toLocaleString('en-US', { timeZone: TIMEZONE }));
  const day = berlinDate.getDay();
  return day === 0 || day === 6;
}

/**
 * Fetch and parse XML meal data from cvzi/mensahd
 * @param {string} location - Mensa location ID (e.g., 'studierendenhaus')
 * @returns {Promise<Object>} Parsed meal data
 */
async function fetchMensaData(location) {
  return new Promise((resolve, reject) => {
    const url = `${BASE_URL}/hamburg_${location}.xml`;

    https.get(url, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        xml2js.parseString(data, {
          explicitArray: false,
          mergeAttrs: true,
          normalize: true,
          trim: true,
          normalizeTags: true,  // Convert tags to lowercase
          tagNameProcessors: [xml2js.processors.stripPrefix]  // Remove namespace prefixes
        }, (err, result) => {
          if (err) {
            reject(err);
          } else {
            resolve(result);
          }
        });
      });
    }).on('error', (err) => {
      reject(err);
    });
  });
}

/**
 * Extract meals for a specific date from parsed XML data
 * @param {Object} parsedData - Parsed XML data
 * @param {string} date - Date in YYYY-MM-DD format
 * @param {string} location - Mensa location ID
 * @returns {Array} Array of meal objects
 */
function extractMealsForDate(parsedData, date, location) {
  try {
    // Validate parsed data structure
    if (!parsedData || !parsedData.openmensa || !parsedData.openmensa.canteen) {
      console.error(`Invalid data structure for ${location}`);
      return [];
    }

    const canteen = parsedData.openmensa.canteen;
    let days = canteen.day;

    // If no days, return empty
    if (!days) {
      return [];
    }

    // Handle single day vs array of days
    if (!Array.isArray(days)) {
      days = [days];
    }

    // Find the day matching our date
    const targetDay = days.find(day => day.date === date);

    if (!targetDay) {
      return [];
    }

    const meals = [];
    let categories = targetDay.category;

    // Handle single category vs array
    if (!Array.isArray(categories)) {
      categories = [categories];
    }

    // Don't filter categories anymore - keep all

    categories.forEach(category => {
      // Special handling for Philturm Gemüsebar - replace all meals with single placeholder
      if (location === 'philturm' && category.name && category.name.toLowerCase().includes('gemüsebar')) {
        meals.push({
          name: 'Gemüsebar',
          category: category.name,
          date: date,
          mensa_location: location,
          price_student: '0.85',
          price_employee: '0.85',
          price_other: '0.85',
          notes: 'Vegetarisch',
          external_id: `${location}_${date}_Gemuesebar`
        });
        return; // Skip processing individual Gemüsebar meals
      }

      let categoryMeals = category.meal;

      // Handle single meal vs array
      if (!Array.isArray(categoryMeals)) {
        categoryMeals = [categoryMeals];
      }

      categoryMeals.forEach(meal => {
        // Check if price exists before trying to parse it
        const prices = meal.price ? (Array.isArray(meal.price) ? meal.price : [meal.price]) : [];
        const priceStudent = prices.find(p => p && p.role === 'student')?._ || null;
        const priceEmployee = prices.find(p => p && p.role === 'employee')?._ || null;
        const priceOther = prices.find(p => p && p.role === 'other')?._ || null;

        // Extract notes (dietary info, allergens)
        let notes = [];
        if (meal.note) {
          notes = Array.isArray(meal.note) ? meal.note : [meal.note];
        }

        const filteredNotes = simplifyNotes(notes);
        const cleanedName = cleanMealName(meal.name);

        meals.push({
          name: cleanedName,
          category: category.name,
          date: date,
          mensa_location: location,
          price_student: priceStudent,
          price_employee: priceEmployee,
          price_other: priceOther,
          notes: filteredNotes.length > 0 ? filteredNotes.join(', ') : '',
          external_id: `${location}_${date}_${meal.name.replace(/\s+/g, '_')}`
        });
      });
    });

    return meals;
  } catch (error) {
    console.error('Error extracting meals:', error);
    return [];
  }
}

/**
 * Get today's meals for a specific location (Berlin timezone)
 * @param {string} location - Mensa location ID
 * @returns {Promise<Array>} Array of meals
 */
async function getTodaysMeals(location) {
  if (isBerlinWeekend()) {
    return [];
  }

  const today = getBerlinDate(); // YYYY-MM-DD format

  try {
    const data = await fetchMensaData(location);

    // Debug: log the structure we received
    if (!data || !data.openmensa) {
      console.log(`Unexpected data structure from ${location}:`, JSON.stringify(data).substring(0, 200));
      return [];
    }

    // Try today first
    let meals = extractMealsForDate(data, today, location);

    return meals;
  } catch (error) {
    console.error(`Error fetching meals for ${location}:`, error);
    return [];
  }
}

/**
 * Reduce raw OpenMensa notes to a curated set of dietary tags
 * @param {string[]} notes
 * @returns {string[]} filtered unique labels
 */
function simplifyNotes(notes = []) {
  const matchedLabels = new Set();

  notes.forEach(note => {
    NOTE_LABELS.forEach(({ label, patterns }) => {
      if (patterns.some(pattern => pattern.test(note))) {
        matchedLabels.add(label);
      }
    });
  });

  // Vegan implies vegetarian and lactose-free, keep only Vegan
  if (matchedLabels.has('Vegan')) {
    matchedLabels.delete('Vegetarisch');
    matchedLabels.delete('Laktosefrei');
  }

  return NOTE_LABELS
    .map(({ label }) => label)
    .filter(label => matchedLabels.has(label));
}

/**
 * Remove allergen code parentheses from meal names
 * @param {string} name
 * @returns {string}
 */
function cleanMealName(name = '') {
  if (!name || typeof name !== 'string') {
    return name;
  }

  let cleaned = name.replace(/\s*\(([0-9A-Za-zÄÖÜäöüß.,\s-]+)\)/g, (match, content) => {
    const parts = content.split(/\s*,\s*/).filter(Boolean);

    if (
      parts.length > 0 &&
      parts.every(part =>
        /^[0-9A-Za-zÄÖÜäöüß]+$/.test(part) &&
        part.length <= 4
      )
    ) {
      return '';
    }

    return ` (${content})`;
  });

  cleaned = cleaned.replace(/\s{2,}/g, ' ').trim();
  cleaned = cleaned.replace(/\s+,/g, ',');

  return cleaned;
}

/**
 * Fetch opening times from meta file
 * @param {string} location - Mensa location ID
 * @returns {Promise<string>} Opening times string
 */
async function fetchOpeningTimes(location) {
  return new Promise((resolve, reject) => {
    const url = `${META_URL}/hamburg_${location}.xml`;

    https.get(url, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        xml2js.parseString(data, {
          explicitArray: false,
          mergeAttrs: true,
          normalize: true,
          trim: true,
          normalizeTags: true,
          tagNameProcessors: [xml2js.processors.stripPrefix]
        }, (err, result) => {
          if (err) {
            reject(err);
            return;
          }

          try {
            const times = result?.openmensa?.canteen?.times;
            if (!times || times.type !== 'opening') {
              resolve('');
              return;
            }

            // Extract Monday-Friday times
            const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'];
            const openTimes = days
              .map(day => times[day])
              .filter(time => time && time.open);

            if (openTimes.length === 0) {
              resolve('');
              return;
            }

            // Check if all weekdays have same hours
            const firstOpen = openTimes[0].open;
            const allSame = openTimes.every(t => t.open === firstOpen);

            if (allSame) {
              resolve(`OPENING TIMES Mo - Fr ${firstOpen} Uhr`);
            } else {
              resolve('OPENING TIMES vary by day');
            }
          } catch (error) {
            console.error(`Error parsing opening times for ${location}:`, error);
            resolve('');
          }
        });
      });
    }).on('error', (err) => {
      reject(err);
    });
  });
}

/**
 * Get today's meals for all available locations
 * @returns {Promise<Array>} Array of all today's meals across locations
 */
async function getAllTodaysMeals() {
  if (isBerlinWeekend()) {
    return [];
  }

  const locations = Object.keys(MENSA_LOCATIONS);
  const allMeals = [];

  for (const location of locations) {
    try {
      const meals = await getTodaysMeals(location);
      allMeals.push(...meals);
    } catch (error) {
      console.error(`Failed to fetch meals for ${location}:`, error);
    }
  }

  return allMeals;
}

module.exports = {
  MENSA_LOCATIONS,
  fetchMensaData,
  getTodaysMeals,
  getAllTodaysMeals,
  extractMealsForDate,
  simplifyNotes,
  fetchOpeningTimes,
  getBerlinDate,
  isBerlinWeekend
};
