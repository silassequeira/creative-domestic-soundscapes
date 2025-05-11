using System;
using System.Collections.Generic;
using UnityEngine;

[Serializable]
<<<<<<< HEAD
public class Vector3Data
{
    public float x;
    public float y;
    public float z;
}

[Serializable]
public class ShapeData
{
    public string name;
    public string shape;
    public Vector3Data size;
    public Vector3Data position;
    public Vector3Data rotation;
    public string color;
=======
public class WallData
{
    public string id;
    public float[] position;
    public float width;
    public float height;
    public float depth;
    public float[] rotation;
}

[Serializable]
public class FloorData
{
    public string id;
    public float[] position;
    public float width;
    public float height;
    public float depth;
    public float[] rotation;
>>>>>>> bb33b88959aa82680153772d48f5e6d602e5d1e9
}

[Serializable]
public class EnvironmentData
{
<<<<<<< HEAD
    public string name;
    public float width;
    public float depth;
    public float wall_thickness;
    public List<ShapeData> shapes;
=======
    public List<WallData> walls;
    public FloorData floor;
>>>>>>> bb33b88959aa82680153772d48f5e6d602e5d1e9
}

[Serializable]
public class RoomData
{
    public EnvironmentData environment;
<<<<<<< HEAD
    public List<ShapeData> objects;
}
=======
}
>>>>>>> bb33b88959aa82680153772d48f5e6d602e5d1e9
