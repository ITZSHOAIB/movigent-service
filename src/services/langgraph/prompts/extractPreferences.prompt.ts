import type { MoviePreferences } from "../langgraph.service";

export const extractPreferencesPrompt = () => {
  return `
Analyze the user's input and update the current movie preferences (likes and dislikes). Identify both positive preferences (likes) and negative preferences (dislikes). Return the preferences in valid JSON format with "positive" and "negative" keys. All values MUST be in lowercase.

Instructions:
- If the user expresses a preference for a genre, actor, director, or mood, ADD it to the "likes" list.
- If the user expresses dislike or explicitly negates a preference, ADD it to the "dislikes" list.
- If the user expresses a dislike for an existing "like," REMOVE it from the "likes" list and ADD it to the "dislikes" list.
- If the user expresses a preference for an existing "dislike," REMOVE it from the "dislikes" list and ADD it to the "likes" list.

Output format:
{{
  "likes": {{
    "genres": [],
    "actors": [],
    "directors": [],
    "moods": []
  }},
  "dislikes": {{
    "genres": [],
    "actors": [],
    "directors": [],
    "moods": []
  }}
}}

Examples:
1. User input: "I like comedy and action, but I don't like Tom Cruise."
   Output: {{
     "likes": {{"genres": ["comedy", "action"], "actors": [], "directors": [], "moods": []}},
     "dislikes": {{"genres": [], "actors": ["tom cruise"], "directors": [], "moods": []}}
   }}

2. User input: "I want to watch something with Leonardo DiCaprio."
   Output: {{
     "likes": {{"genres": [], "actors": ["leonardo dicaprio"], "directors": [], "moods": []}},
     "dislikes": {{"genres": [], "actors": [], "directors": [], "moods": []}}
   }}

3. User input: "I dislike horror movies."
   Output: {{
     "likes": {{"genres": [], "actors": [], "directors": [], "moods": []}},
     "dislikes": {{"genres": ["horror"], "actors": [], "directors": [], "moods": []}}
   }}

4. User input: "I don't like comedy movies too."
   Output: {{
    "likes": {{"genres": [], "actors": [], "directors": [], "moods": []}},
    "dislikes": {{"genres": ["comedy"], "actors": [], "directors": [], "moods": []}}
   }}

5. User input: "Actually, I like Tom Cruise again."
   Current Likes: {{"genres": ["action"],"actors": [],"directors": [],"moods": []}}
   Current Dislikes: {{"genres": [],"actors": ["tom cruise"],"directors": [],"moods": []}}
   Output: {{
    "likes": {{"genres": [],"actors": ["tom cruise"],"directors": [],"moods": []}},
    "dislikes": {{"genres": [],"actors": [],"directors": [],"moods": []}}
   }}

6. User input: "I don't like action anymore."
   Current Likes: {{"genres": ["action"],"actors": ["leonardo dicaprio"],"directors": [],"moods": []}}
   Current Dislikes: {{"genres": [],"actors": [],"directors": [],"moods": []}}
   Output: {{
    "likes": {{"genres": [],"actors": ["leonardo dicaprio"],"directors": [],"moods": []}},
    "dislikes": {{"genres": ["action"],"actors": [],"directors": [],"moods": []}}
   }}

Return STRICTLY ONLY the JSON. No other text.
`;
};
