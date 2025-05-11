using System;

[Serializable]
public class AgentData
{
    public string name;
    public TrajectoryStep[] trajectory;
}

[Serializable]
public class TrajectoryStep
{
    public string target;
    public float wait_time;
    public string sound_clip;
}
[System.Serializable]
public class AgentWrapper
{
    public AgentData agent;
}

