export function parseOptions(args) {
  const options = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg.startsWith("--")) {
      if (!options._) options._ = [];
      options._.push(arg);
      continue;
    }

    const key = arg.slice(2);
    const value = args[index + 1];
    if (value === undefined || value.startsWith("--")) {
      options[key] = true;
      continue;
    }

    options[key] = value;
    index += 1;
  }

  return options;
}

export function inputNameForDay(day) {
  const normalized = day.toLowerCase();
  const map = {
    mon: "regValue1",
    monday: "regValue1",
    man: "regValue1",
    "25/05": "regValue1",
    tue: "regValue2",
    tuesday: "regValue2",
    tir: "regValue2",
    "26/05": "regValue2",
    wed: "regValue3",
    wednesday: "regValue3",
    ons: "regValue3",
    "27/05": "regValue3",
    thu: "regValue4",
    thursday: "regValue4",
    tor: "regValue4",
    "28/05": "regValue4",
    fri: "regValue5",
    friday: "regValue5",
    fre: "regValue5",
    "29/05": "regValue5",
    sat: "regValue6",
    saturday: "regValue6",
    lor: "regValue6",
    lør: "regValue6",
    "30/05": "regValue6",
    sun: "regValue7",
    sunday: "regValue7",
    son: "regValue7",
    søn: "regValue7",
    "31/05": "regValue7",
  };

  if (!map[normalized]) {
    throw new Error(`Unknown day: ${day}`);
  }

  return map[normalized];
}

export function lineTotal(line) {
  return ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]
    .map((day) => Number.parseFloat(String(line[day] || "0").replace(",", ".")) || 0)
    .reduce((sum, value) => sum + value, 0);
}

export function normalizeNumber(value) {
  const parsed = Number.parseFloat(String(value || "0").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
}

export function formatUnit4Decimal(value) {
  return String(value).replace(".", ",");
}

export function dayKeyForInputName(inputName) {
  const map = {
    regValue1: "mon",
    regValue2: "tue",
    regValue3: "wed",
    regValue4: "thu",
    regValue5: "fri",
    regValue6: "sat",
    regValue7: "sun",
  };
  return map[inputName];
}
