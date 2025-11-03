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

async function upsertMeals(meals = []) {
  if (!Array.isArray(meals) || meals.length === 0) {
    return;
  }

  await cleanupPhilturmGemuesebar(meals);

  for (const meal of meals) {
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
