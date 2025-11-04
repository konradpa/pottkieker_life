const db = require('../database');

function runAsync(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function callback(err) {
      if (err) {
        reject(err);
      } else {
        resolve(this);
      }
    });
  });
}

function normalizeString(value) {
  if (value === null || value === undefined) {
    return '';
  }

  return String(value).trim();
}

function hasAnyPrice(meal = {}) {
  const priceFields = ['price_student', 'price_employee', 'price_other'];
  return priceFields.some(field => normalizeString(meal[field]) !== '');
}

function isMealEmpty(meal = {}) {
  const name = normalizeString(meal.name);
  const notes = normalizeString(meal.notes);

  return name === '' && notes === '' && !hasAnyPrice(meal);
}

async function cleanupEmptyMeals(emptyMeals = []) {
  if (!Array.isArray(emptyMeals) || emptyMeals.length === 0) {
    return;
  }

  const cleanupTargets = new Map();

  emptyMeals.forEach(meal => {
    const location = meal && meal.mensa_location ? meal.mensa_location : null;
    const date = meal && meal.date ? meal.date : null;
    const key = `${location || 'unknown'}|${date || 'unknown'}`;

    if (!cleanupTargets.has(key)) {
      cleanupTargets.set(key, {
        location,
        date,
        externalIds: new Set()
      });
    }

    if (meal && meal.external_id) {
      cleanupTargets.get(key).externalIds.add(meal.external_id);
    }
  });

  for (const { location, date, externalIds } of cleanupTargets.values()) {
    const baseConditions = [];
    const params = [];

    if (location) {
      baseConditions.push('mensa_location = ?');
      params.push(location);
    } else {
      baseConditions.push('mensa_location IS NULL');
    }

    if (date) {
      baseConditions.push('date = ?');
      params.push(date);
    }

    if (baseConditions.length === 0) {
      baseConditions.push('1 = 1');
    }

    const priceEmptyCondition = "COALESCE(TRIM(price_student), '') = '' AND COALESCE(TRIM(price_employee), '') = '' AND COALESCE(TRIM(price_other), '') = ''";

    const deleteClauses = [
      `( (name IS NULL OR TRIM(name) = '')
         AND (notes IS NULL OR TRIM(notes) = '')
         AND ${priceEmptyCondition} )`
    ];

    if (externalIds.size > 0) {
      const placeholders = Array.from(externalIds).map(() => '?').join(', ');
      deleteClauses.push(`external_id IN (${placeholders})`);
      params.push(...externalIds);
    }

    const sql = `
      DELETE FROM meals
      WHERE ${baseConditions.join(' AND ')}
        AND (${deleteClauses.join(' OR ')})
    `;

    await runAsync(sql, params);
  }
}

async function cleanupPhilturmGemuesebar(meals) {
  const philturmDates = [...new Set(
    meals
      .filter(meal => meal.mensa_location === 'philturm')
      .map(meal => meal.date)
      .filter(Boolean)
  )];

  if (philturmDates.length === 0) {
    return;
  }

  for (const date of philturmDates) {
    await runAsync(
      `DELETE FROM meals
         WHERE mensa_location = 'philturm'
         AND date = ?
         AND category LIKE '%Gemüsebar%'
         AND external_id != ?`,
      [date, `philturm_${date}_Gemuesebar`]
    );
  }
}

async function cleanupPastabar(meals) {
  // Group meals by location and date
  const pastabarMeals = meals.filter(meal =>
    meal.category && meal.category.toLowerCase().includes('pasta')
  );

  const locationsAndDates = [...new Set(
    pastabarMeals.map(meal => `${meal.mensa_location}|${meal.date}`)
  )];

  if (locationsAndDates.length === 0) {
    return;
  }

  // For each location-date combination, get the external_ids that should be kept
  for (const locationDate of locationsAndDates) {
    const [location, date] = locationDate.split('|');
    const externalIdsToKeep = pastabarMeals
      .filter(meal => meal.mensa_location === location && meal.date === date)
      .map(meal => meal.external_id);

    if (externalIdsToKeep.length === 0) {
      continue;
    }

    // Delete old Pastabar entries that are not in the current meal list
    const placeholders = externalIdsToKeep.map(() => '?').join(', ');
    await runAsync(
      `DELETE FROM meals
         WHERE mensa_location = ?
         AND date = ?
         AND category LIKE '%Pasta%'
         AND external_id NOT IN (${placeholders})`,
      [location, date, ...externalIdsToKeep]
    );
  }
}

async function upsertMeals(meals = []) {
  if (!Array.isArray(meals) || meals.length === 0) {
    return;
  }

  await cleanupPhilturmGemuesebar(meals);
  await cleanupPastabar(meals);

  const emptyMeals = meals.filter(isMealEmpty);
  const validMeals = meals.filter(meal => !isMealEmpty(meal));

  await cleanupEmptyMeals(emptyMeals);

  if (validMeals.length === 0) {
    return;
  }

  for (const meal of validMeals) {
    await runAsync(
      `INSERT INTO meals (external_id, name, category, date, mensa_location, price_student, price_employee, price_other, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(external_id) DO UPDATE SET
           name = excluded.name,
           category = excluded.category,
           date = excluded.date,
           mensa_location = excluded.mensa_location,
           price_student = excluded.price_student,
           price_employee = excluded.price_employee,
           price_other = excluded.price_other,
           notes = excluded.notes`,
      [
        meal.external_id,
        meal.name,
        meal.category,
        meal.date,
        meal.mensa_location,
        meal.price_student,
        meal.price_employee,
        meal.price_other,
        meal.notes
      ]
    );
  }
}

module.exports = {
  upsertMeals
};
