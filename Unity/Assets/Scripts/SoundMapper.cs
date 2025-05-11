using System;
using System.Collections;
using System.Collections.Generic;
using System.IO;
using UnityEngine;

public class SoundMapper : MonoBehaviour
{
    [Header("Configuration")]
    public string soundMappingsFileName = "unity_sound_mappings.json";
    public string soundsFolderPath = "Sounds";

    [Header("Sound Settings")]
    [Range(0f, 1f)]
    public float globalVolume = 0.8f;

    [Range(0f, 1f)]
    public float spatialBlend = 0.8f;

    public float maxDistance = 20f;

    // Dicionário de objetos com sons associados
    private Dictionary<string, AudioSource> objectAudioSources = new Dictionary<string, AudioSource>();

    void Start()
    {
        StartCoroutine(InitSoundMapping());
    }

    public bool IsReady { get; private set; } = false;

    IEnumerator InitSoundMapping()
    {
        yield return new WaitForEndOfFrame();
        LoadSoundMappings();
        ApplySoundsToSceneObjects();
        IsReady = true;
    }

    void LoadSoundMappings()
    {
        string filePath = Path.Combine(Application.streamingAssetsPath, soundMappingsFileName);
        if (!File.Exists(filePath))
        {
            Debug.LogError("Ficheiro de mapeamento de sons não encontrado: " + filePath);
            return;
        }

        string jsonContent = File.ReadAllText(filePath);
        soundMappings = JsonUtility.FromJson<SoundMappingData>(jsonContent);

        if (soundMappings == null || soundMappings.soundMappings == null || soundMappings.soundMappings.Count == 0)
        {
            Debug.LogError("Erro ao ler mapeamento de sons ou ficheiro vazio.");
            return;
        }

        Debug.Log($"Foram carregados {soundMappings.soundMappings.Count} mapeamentos de som.");
    }

    private SoundMappingData soundMappings;

    void ApplySoundsToSceneObjects()
    {
        Transform[] allObjects = FindObjectsByType<Transform>(FindObjectsSortMode.None);
        Debug.Log($"Total objects found in scene: {allObjects.Length}");

        foreach (SoundMapping mapping in soundMappings.soundMappings)
        {
            if (mapping.type.ToLower() != "background")
            {
                Transform found = Array.Find(allObjects, o => o.name.Equals(mapping.objectName, StringComparison.OrdinalIgnoreCase));
                Debug.Log($"Looking for object: {mapping.objectName}, Found: {(found != null ? "Yes" : "No")}");
                
                if (found != null)
                {
                    AudioSource source = found.gameObject.GetComponent<AudioSource>();
                    if (source == null)
                    {
                        source = found.gameObject.AddComponent<AudioSource>();
                    }

                    source.playOnAwake = false;
                    source.loop = mapping.loop;
                    source.volume = mapping.volume * globalVolume;
                    source.spatialBlend = spatialBlend;
                    source.rolloffMode = AudioRolloffMode.Linear;
                    source.maxDistance = maxDistance;

                    StartCoroutine(LoadAndAssignAudioClip(source, mapping.filename, false));
                    objectAudioSources[mapping.objectName] = source;

                    Debug.Log($"Sound assigned to {mapping.objectName}: {mapping.title} (Has AudioSource: {source != null})");
                }
            }
        }
    }

    IEnumerator LoadAndAssignAudioClip(AudioSource audioSource, string filename, bool playWhenLoaded)
    {
        string baseFolder = Path.Combine(Application.streamingAssetsPath, soundsFolderPath);
        string filePath = null;

        Debug.Log($"Searching for audio file: {filename} in {baseFolder}");

        // Find the file path
        try
        {
            string basePath = Path.Combine(baseFolder, filename);
            if (File.Exists(basePath))
            {
                filePath = basePath;
                Debug.Log($"Found audio file at: {filePath}");
            }
            else
            {
                string[] foundFiles = Directory.GetFiles(baseFolder, filename, SearchOption.AllDirectories);
                if (foundFiles.Length > 0)
                {
                    filePath = foundFiles[0];
                    Debug.Log($"Found audio file at: {filePath}");
                }
            }
        }
        catch (Exception e)
        {
            Debug.LogError($"Error searching for audio file: {e.Message}");
            yield break;
        }

        if (filePath == null)
        {
            Debug.LogError($"Audio file not found: {filename}");
            yield break;
        }

        string uriPath = "file://" + filePath.Replace("\\", "/");
        Debug.Log($"Loading audio from URI: {uriPath}");

        AudioType audioType = GetAudioType(Path.GetExtension(filePath));
        Debug.Log($"Trying to load: {filePath} with extension {Path.GetExtension(filePath)} and AudioType {audioType}");
        if (audioType == AudioType.UNKNOWN)
        {
            Debug.LogError($"Unsupported audio format: {Path.GetExtension(filePath)}");
            yield break;
        }

        UnityEngine.Networking.UnityWebRequest www = null;
        try
        {
            www = UnityEngine.Networking.UnityWebRequestMultimedia.GetAudioClip(uriPath, audioType);
        }
        catch (Exception e)
        {
            Debug.LogError($"Error creating UnityWebRequest: {e.Message}");
            yield break;
        }

        yield return www.SendWebRequest();

        try
        {
            if (www.result == UnityEngine.Networking.UnityWebRequest.Result.Success)
            {
                AudioClip clip = UnityEngine.Networking.DownloadHandlerAudioClip.GetContent(www);
                if (clip != null)
                {
                    clip.name = Path.GetFileNameWithoutExtension(filename);
                    audioSource.clip = clip;
                    Debug.Log($"Successfully loaded audio: {filename} for {audioSource.gameObject.name}");

                    if (playWhenLoaded)
                        audioSource.Play();
                }
                else
                {
                    Debug.LogError($"Failed to create AudioClip from {filename}");
                }
            }
            else
            {
                Debug.LogError($"Error loading audio {filename}: {www.error}");
            }
        }
        catch (Exception e)
        {
            Debug.LogError($"Error processing audio clip: {e.Message}");
        }
        finally
        {
            if (www != null)
                www.Dispose();
        }
    }

    AudioType GetAudioType(string extension)
    {
        switch (extension)
        {
            case ".mp3": return AudioType.MPEG;
            case ".ogg": return AudioType.OGGVORBIS;
            case ".wav": return AudioType.WAV;
            default: return AudioType.UNKNOWN;
        }
    }

    // Método público para o AgentController aceder
    public Dictionary<string, AudioSource> GetObjectAudioSources()
    {
        return objectAudioSources;
    }

    // Permite o agente tocar um som
    public void PlaySoundForObject(string objectName)
    {
        Debug.Log($"Attempting to play sound for: {objectName}");
        
        if (objectAudioSources.TryGetValue(objectName, out AudioSource source))
        {
            if (source != null)
            {
                if (source.clip == null)
                {
                    Debug.LogError($"No AudioClip assigned for {objectName}");
                    return;
                }
                
                if (!source.isPlaying)
                {
                    source.Play();
                    Debug.Log($"Playing sound for {objectName}");
                }
                else
                {
                    Debug.Log($"Sound for {objectName} is already playing");
                }
            }
            else
            {
                Debug.LogError($"AudioSource is null for {objectName}");
            }
        }
        else
        {
            Debug.LogError($"No AudioSource found for object: {objectName}");
        }
    }
}
