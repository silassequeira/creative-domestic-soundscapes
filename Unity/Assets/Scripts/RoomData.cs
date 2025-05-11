using System;
using System.Collections.Generic;
using UnityEngine;

[Serializable]
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
}

[Serializable]
public class EnvironmentData
{
    public string name;
    public float width;
    public float depth;
    public float wall_thickness;
    public List<ShapeData> shapes;
}

[Serializable]
public class RoomData
{
    public EnvironmentData environment;
    public List<ShapeData> objects;
}