Pick a profession at random. Then generate a complete JSON definition of that person’s bedroom.

Requirements:

Top-level structure:

```json
{
  "environment": {
    "name": "",
    "width": 0.0,
    "depth": 0.0,
    "wall_thickness": 0.0,
    "shapes": []
  },
  "objects": []
}
```

1. environment

   - `"name"`: must be `""<e.g. 'Bedroom Painter'>"`
   - `"width"`, `"depth"`, `"wall_thickness"`: numbers in meters (e.g. 4.0)
   - Include five wall/floor shapes (Floor, Wall_North, Wall_South, Wall_East, Wall_West) with realistic `size`, `position`, `rotation`, and a CSS‐style color (e.g. "#F0E7D8").
   - Include two window/door shapes (Window1, Door1) with realistic `size`, `position`, `rotation`, and a CSS‐style color (e.g. "#F0E7D8") and a thickness of `"wall_thickness"` + 0.05 meters .
   - Each shape must include:
     e.g.

   ```json
   {
     "name": "<e.g. 'Wall_North'>",
     "shape": "Cube",
     "size": { "x": 4, "y": 2.5, "z": 0.2 },
     "position": { "x": 0, "y": 1.3, "z": 2.6 },
     "color": "<e.g. '#F0E7D8'>"
   }
   ```

2. objects

- Include at least ten objects
- Each object must include:
  e.g.
  ```json
  {
    "name": "<e.g. 'Desk'>",
    "shape": "<e.g. 'Cube'|'Cylinder'|'Sphere'|'Capsule'>",
    "size": { "x": 1.2, "y": 0.75, "z": 0.6 },
    "position": { "x": 1.5, "y": 0.375, "z": 1.0 },
    "rotation": { "x": 90, "y": 45, "z": 180 },
    "color": "<e.g. '#F0E7D8'>"
  }
  ```
- Furnish according to the randomly chosen profession (e.g. “Architect” gets drafting table, model stands; “Musician” gets instrument stand, amplifier; etc.).

Output: A single JSON object, valid and fully populated.
