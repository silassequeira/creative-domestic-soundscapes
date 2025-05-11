using System.Collections;
using System.Collections.Generic;
using UnityEngine;
using System.Linq;

public class AgentController : MonoBehaviour
{
    public float speed = 2f;
    public float interactionDelay = 10f;
    public float yTolerance = 1.0f;

    private List<Transform> targetObjects = new List<Transform>();
    private int currentIndex = 0;

    void Start()
    {
        StartCoroutine(InitializeWhenReady());
    }

    IEnumerator InitializeWhenReady()
    {
        SoundMapper mapper = null;

        // Esperar pelo SoundMapper e pela flag IsReady
        while (mapper == null || !mapper.IsReady)
        {
            mapper = FindFirstObjectByType<SoundMapper>();
            yield return null;
        }

        PrepareTargetList(mapper);

        if (targetObjects.Count > 0)
        {
            StartCoroutine(MoveLoop(mapper));
        }
        else
        {
            Debug.LogWarning("AgentController: Nenhum objeto válido com som encontrado.");
        }
    }

    void PrepareTargetList(SoundMapper mapper)
    {
        float agentY = transform.position.y;
        Debug.Log($"Agent Y position: {agentY}");
        
        var audioSources = mapper.GetObjectAudioSources();
        Debug.Log($"Total audio sources found: {audioSources.Count}");

        foreach (var pair in audioSources)
        {
            Transform objTransform = pair.Value.transform;
            float objY = objTransform.position.y;
            
            Debug.Log($"Checking object: {pair.Key} at position {objTransform.position}");
            
            if (Mathf.Abs(objY - agentY) <= yTolerance)
            {
                targetObjects.Add(objTransform);
                Debug.Log($"Added {pair.Key} to targets list");
            }
            else
            {
                Debug.Log($"Skipped {pair.Key} - Y difference too large: {Mathf.Abs(objY - agentY)}");
            }
        }

        Debug.Log($"Final target objects count: {targetObjects.Count}");
        ShuffleList(targetObjects);
    }

    IEnumerator MoveLoop(SoundMapper mapper)
    {
        while (true)
        {
            Transform target = targetObjects[currentIndex];

            // Mover até ao objeto
            while (Vector3.Distance(transform.position, target.position) > 0.1f)
            {
                transform.position = Vector3.MoveTowards(transform.position, target.position, speed * Time.deltaTime);
                yield return null;
            }

            // Tocar som
            mapper.PlaySoundForObject(target.name);

            // Esperar
            yield return new WaitForSeconds(interactionDelay);

            // Próximo objeto
            currentIndex = (currentIndex + 1) % targetObjects.Count;

            // Quando terminar o ciclo, reembaralhar
            if (currentIndex == 0)
                ShuffleList(targetObjects);
        }
    }

    void ShuffleList<T>(List<T> list)
    {
        for (int i = 0; i < list.Count; i++)
        {
            T temp = list[i];
            int randIndex = Random.Range(i, list.Count);
            list[i] = list[randIndex];
            list[randIndex] = temp;
        }
    }
}
