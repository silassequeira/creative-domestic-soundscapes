using System.Collections;
using UnityEngine;

public class AgentController : MonoBehaviour
{
    public AgentData agentData;
    public float speed = 2f;

    void Start()
    {
        StartCoroutine(FollowTrajectory());
    }

    IEnumerator FollowTrajectory()
    {
        foreach (var step in agentData.trajectory)
        {
            GameObject target = GameObject.Find(step.target);
            if (target == null)
            {
                Debug.LogWarning("Objeto não encontrado: " + step.target);
                continue;
            }

            while (Vector3.Distance(transform.position, target.transform.position) > 0.1f)
            {
                transform.position = Vector3.MoveTowards(transform.position, target.transform.position, speed * Time.deltaTime);
                yield return null;
            }

            yield return new WaitForSeconds(step.wait_time);

            AudioSource audio = GetComponent<AudioSource>();
            AudioClip clip = Resources.Load<AudioClip>(step.sound_clip);
            if (clip != null && audio != null)
                audio.PlayOneShot(clip);
        }
    }
}
