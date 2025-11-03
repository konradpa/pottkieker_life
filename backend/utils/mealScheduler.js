const cron = require('node-cron');
const { getAllTodaysMeals, getBerlinDate, isBerlinWeekend } = require('./mensaParser');
const { upsertMeals } = require('./mealStorage');

const MEAL_REFRESH_SCHEDULE = '5 0 * * *'; // 00:05 every day to give the feed time to update

async function refreshMealsForToday() {
  const today = getBerlinDate();

  if (isBerlinWeekend()) {
    console.log(`[Meal Scheduler] ${today} is a weekend day. Skipping meal refresh.`);
    return;
  }

  try {
    console.log(`[Meal Scheduler] Refreshing meals for ${today}...`);
    const meals = await getAllTodaysMeals();

    if (!meals || meals.length === 0) {
      console.warn(`[Meal Scheduler] No meals fetched for ${today}.`);
      return;
    }

    await upsertMeals(meals);
    console.log(`[Meal Scheduler] Stored ${meals.length} meals for ${today}.`);
  } catch (error) {
    console.error(`[Meal Scheduler] Failed to refresh meals for ${today}:`, error);
  }
}

function initMealScheduler() {
  cron.schedule(MEAL_REFRESH_SCHEDULE, () => {
    refreshMealsForToday().catch(err => {
      console.error('[Meal Scheduler] Unhandled error during refresh:', err);
    });
  }, {
    scheduled: true,
    timezone: 'Europe/Berlin'
  });

  console.log('[Meal Scheduler] Daily meal refresh scheduled for 00:05 Europe/Berlin.');
  refreshMealsForToday().catch(err => {
    console.error('[Meal Scheduler] Initial refresh failed:', err);
  });
}

module.exports = {
  initMealScheduler,
  refreshMealsForToday
};
