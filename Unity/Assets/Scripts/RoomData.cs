using System;
using System.Collections.Generic;
using UnityEngine;

[Serializable]
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
}

[Serializable]
public class EnvironmentData
{
    public List<WallData> walls;
    public FloorData floor;
}

[Serializable]
public class RoomData
{
    public EnvironmentData environment;
}
