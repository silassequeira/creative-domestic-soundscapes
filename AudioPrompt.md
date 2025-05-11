Consider the profession previously picked, and pick six of the objects in the JSON file.

Requirements:

Top-level Structure:

```json
{
  "scene": {
    "filter_params": {
      "duration": [0.5, 3],
      "filesize": "< 2MB",
      "license": "creative_commons",
      "ac_single_event": true
    },
    "interactions": [],
    "background": {}
  }
}
```

1. interactions

Should include sounds associated with human interaction with the objects present in the bedroom.

- title: Short descriptive name, e.g., `"Desk drawer open"`, `"Guitar strum"`.
- object: The original object `"name"` from the environment JSON.
- freesound_query: A concise search string for an appropriate sample, e.g., `"keyboard typing"`, `"wooden drawer open"`.
- duration: Estimated length in seconds (e.g., `2.5`).
- loop: Boolean, typically `false` for interaction sounds.
- volume: Relative loudness between `0.0` and `1.0`.

- Each interaction object should include:
  e.g.

```json
{
  "title": "<e.g. 'Keyboard click'>",
  "object": "<e.g. 'Keyboard'>",
  "freesound_query": "<e.g. 'mechanical keyboard click'>",
  "tags": ["<e.g. 'mechanical, click'>"],
  "duration": 1.2,
  "loop": false,
  "volume": 0.4
}
```

2. background

Ambient background sounds that reflect the mood and the nature of the space/profession.

- loop: `true`, since background tracks repeat.
- volume: Relative loudness between `0.0` and `1.0` (e.g., `0.2`).

- Include:
  e.g.

```json
"background": {
  "title": "<e.g. 'Coffee shop'>",
  "freesound_query": "<e.g. 'coffee shop ambiance low chatter'>",
  "tags": ["<e.g. 'night, ambient'>"],
  "duration": 30,
  "loop": true,
  "volume": 0.15
}
```

The structure is intended for fetching sounds from the FreeSound APIv2

Output: A single JSON object, valid and fully populated.
