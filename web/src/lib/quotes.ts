// The dashboard's quote of the day: built in, no external API. Everyone sees
// the same quote on a given day (India time), and it moves to the next one at
// midnight, cycling through the list.

export interface Quote {
  text: string;
  /** Who said it; null for the team's own sayings. */
  author: string | null;
}

export const QUOTES: Quote[] = [
  { text: "Arise, awake, and stop not till the goal is reached.", author: "Swami Vivekananda" },
  { text: "Every call is a chance to help a family get clean, safe water.", author: null },
  { text: "Drop by drop is the water pot filled.", author: "The Dhammapada" },
  { text: "The fortune is in the follow-up.", author: null },
  { text: "A callback made on time is a promise kept.", author: null },
  { text: "A journey of a thousand miles begins with a single step.", author: "Lao Tzu" },
  { text: "Listen first. The customer will tell you exactly what they need.", author: null },
  { text: "Small steps every day add up to big wins every month.", author: null },
  { text: "Well done is better than well said.", author: "Benjamin Franklin" },
  { text: "Your next call could be the best deal of your month.", author: null },
  { text: "Smile when you dial. They can hear it in your voice.", author: null },
  { text: "Fall seven times, stand up eight.", author: "Japanese proverb" },
  { text: "Every “no” brings you one call closer to a “yes”.", author: null },
  { text: "Strong products, honest words, quick service. That's how we win.", author: null },
  { text: "Little drops of water, little grains of sand, make the mighty ocean and the pleasant land.", author: "Julia Carney" },
  { text: "Built to last: our sumps, and our customer relationships.", author: null },
  { text: "Do the hardest call first. The rest of the day gets easier.", author: null },
  { text: "The man who moves a mountain begins by carrying away small stones.", author: "Chinese proverb" },
  { text: "Consistency beats intensity. Show up every day.", author: null },
  { text: "Know the product, care about the customer, and the sale follows.", author: null },
  { text: "Take up one idea. Make that one idea your life.", author: "Swami Vivekananda" },
  { text: "Today's effort is next month's revenue.", author: null },
  { text: "Make it easy to say yes: be clear, be quick, be kind.", author: null },
  { text: "A happy customer is the best salesperson we will ever have.", author: null },
  { text: "Don't wait for the perfect lead. Make every lead count.", author: null },
  { text: "Great teams win together. Help a teammate today.", author: null },
  { text: "Start with the overdue, finish with a smile.", author: null },
  { text: "Progress, not perfection.", author: null },
  { text: "Every site visit is a promise: we'll deliver what we said, when we said.", author: null },
  { text: "Believe in what you sell. Our sumps are built to last, and so is our word.", author: null },
];

const indiaDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" });

/** Days since 1 Jan 1970 by the India calendar date, so the quote changes at midnight India time. */
export function indiaDayNumber(at: Date): number {
  const [y, m, d] = indiaDate.format(at).split("-").map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / 86_400_000);
}

/** Today's quote: the same for everyone all day, the next one tomorrow. */
export function quoteOfTheDay(at: Date = new Date(), quotes: Quote[] = QUOTES): Quote {
  return quotes[indiaDayNumber(at) % quotes.length];
}
