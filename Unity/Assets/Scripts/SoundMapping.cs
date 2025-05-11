using System;
using System.Collections.Generic;

[Serializable]
public class SoundMapping
{
    public string title;
    public string type;
    public string objectName; // Changed from "object" to "objectName"
    public string filename;
    public float duration;
    public bool loop;
    public float volume;
}

[Serializable]
public class SoundMappingData
{
    public List<SoundMapping> soundMappings;
}