// Sample items for the demo. Original placeholder artwork made for Pairpoll (public/demo).
export interface DemoItem {
  id: string;
  name: string;
  src: string;
}

export interface DemoSet {
  question: string;
  ratio: string;
  items: DemoItem[];
}

const art = (id: string, name: string): DemoItem => ({ id, name, src: `/demo/${id}.svg` });

export const demoSets = {
  thumbnails: {
    question: "Which thumbnail would you click?",
    ratio: "16 / 9",
    items: [
      art("sunrise-hike", "Sunrise hike"),
      art("ramen-at-home", "Ramen at home"),
      art("rocket-launch", "Rocket launch"),
      art("plant-care", "Plant care"),
      art("bike-repair", "Bike repair"),
      art("city-at-night", "City at night"),
    ],
  },
  "ad-creatives": {
    question: "Which ad would make you stop scrolling?",
    ratio: "1 / 1",
    items: [
      art("ad-can-close-up", "Can close-up"),
      art("ad-bold-headline", "Bold headline"),
      art("ad-new-badge", "New badge"),
      art("ad-on-the-beach", "On the beach"),
    ],
  },
  logos: {
    question: "Which logo suits a garden shop?",
    ratio: "1 / 1",
    items: [
      art("logo-leaf-mark", "Leaf mark"),
      art("logo-monogram", "Monogram"),
      art("logo-round-badge", "Round badge"),
      art("logo-wordmark", "Wordmark"),
    ],
  },
  designs: {
    question: "Which page would you keep reading?",
    ratio: "4 / 3",
    items: [
      art("design-split-hero", "Split hero"),
      art("design-big-photo", "Big photo"),
      art("design-card-grid", "Card grid"),
      art("design-centered", "Centered"),
    ],
  },
  photos: {
    question: "Which photo should go on the wall?",
    ratio: "3 / 2",
    items: [
      art("photo-wide-lake", "Wide lake"),
      art("photo-boat-close-up", "Boat close-up"),
      art("photo-golden-hour", "Golden hour"),
      art("photo-from-the-dock", "From the dock"),
    ],
  },
  "product-images": {
    question: "Which photo would make you open the listing?",
    ratio: "1 / 1",
    items: [
      art("product-white-background", "White background"),
      art("product-on-a-desk", "On a desk"),
      art("product-with-coffee", "With coffee"),
      art("product-from-above", "From above"),
    ],
  },
  "video-cuts": {
    question: "Which opening makes you want to keep watching?",
    ratio: "16 / 9",
    items: [
      art("cut-problem-first", "Problem first"),
      art("cut-product-first", "Product first"),
      art("cut-face-first", "Face first"),
      art("cut-result-first", "Result first"),
    ],
  },
  "app-screenshots": {
    question: "Which first screenshot makes you want the app?",
    ratio: "9 / 16",
    items: [
      art("app-caption-above", "Caption above"),
      art("app-one-big-feature", "One big feature"),
      art("app-dark-version", "Dark version"),
      art("app-plain-screen", "Plain screen"),
    ],
  },
} satisfies Record<string, DemoSet>;

export type DemoSetName = keyof typeof demoSets;
export const demoSetNames = Object.keys(demoSets) as [DemoSetName, ...DemoSetName[]];
