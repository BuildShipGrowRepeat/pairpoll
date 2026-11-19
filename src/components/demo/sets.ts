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

const thumbnail = (id: string, name: string): DemoItem => ({ id, name, src: `/demo/${id}.svg` });

export const demoSets = {
  thumbnails: {
    question: "Which thumbnail would you click?",
    ratio: "16 / 9",
    items: [
      thumbnail("sunrise-hike", "Sunrise hike"),
      thumbnail("ramen-at-home", "Ramen at home"),
      thumbnail("rocket-launch", "Rocket launch"),
      thumbnail("plant-care", "Plant care"),
      thumbnail("bike-repair", "Bike repair"),
      thumbnail("city-at-night", "City at night"),
    ],
  },
} satisfies Record<string, DemoSet>;

export type DemoSetName = keyof typeof demoSets;
export const demoSetNames = Object.keys(demoSets) as [DemoSetName, ...DemoSetName[]];
