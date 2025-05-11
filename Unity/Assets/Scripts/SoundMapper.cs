using System;
using System.Collections;
using System.Collections.Generic;
using System.IO;
using UnityEngine;

public class SoundMapper : MonoBehaviour
{
    [Header("Configuration")]
    [Tooltip("Path to sound mappings file relative to StreamingAssets")]
    public string soundMappingsFileName = "unity_sound_mappings.json";
    
    [Tooltip("Path to the folder containing the sound files relative to StreamingAssets")]
    public string soundsFolderPath = "Sounds";
    
    [Header("Sound Settings")]
    [Range(0f, 1f)]
    public float globalVolume = 0.8f;
    
    [Tooltip("Add spatial blend to interaction sounds (0 = 2D, 1 = 3D)")]
    [Range(0f, 1f)]
    public float spatialBlend = 0.8f;
    
    [Tooltip("Maximum distance for 3D sounds")]
    public float maxDistance = 20f;
    
    [Header("Interaction")]
    [Tooltip("Enable playing sounds on interaction")]
    public bool enableInteraction = true;
    
    [Tooltip("Key to trigger all interaction sounds (for testing)")]
    public KeyCode testAllSoundsKey = KeyCode.Space;
    
    // Reference to RoomLoader so we can find objects
    private RoomLoader roomLoader;
    
    // For tracking loaded sound mappings
    private SoundMappingData soundMappings;
    private Dictionary<string, AudioSource> objectAudioSources = new Dictionary<string, AudioSource>();
    
    void Start()
    {
        // Find RoomLoader in scene
        roomLoader = FindObjectOfType<RoomLoader>();
        if (roomLoader == null)
        {
            Debug.LogError("RoomLoader component not found in the scene");
            return;
        }
        
        // Wait a frame for room objects to be created
        Invoke("LoadSoundsAfterDelay", 0.1f);
    }
    
    void LoadSoundsAfterDelay()
    {
        LoadSoundMappings();
        ApplySoundsToObjects();
    }
    
    void Update()
    {
        // Test function to play all sounds
        if (enableInteraction && Input.GetKeyDown(testAllSoundsKey))
        {
            PlayAllSounds();
        }
    }
    
    void LoadSoundMappings()
    {
        string filePath = Path.Combine(Application.streamingAssetsPath, soundMappingsFileName);
        
        if (!File.Exists(filePath))
        {
            Debug.LogError("Sound mappings file not found at: " + filePath);
            return;
        }
        
        string jsonContent = File.ReadAllText(filePath);
        soundMappings = JsonUtility.FromJson<SoundMappingData>(jsonContent);
        
        if (soundMappings == null || soundMappings.soundMappings == null || soundMappings.soundMappings.Count == 0)
        {
            Debug.LogError("Failed to parse sound mappings or no sound mappings found");
            return;
        }
        
        Debug.Log($"Loaded {soundMappings.soundMappings.Count} sound mappings");
    }
    
    void ApplySoundsToObjects()
    {
        if (soundMappings == null || soundMappings.soundMappings == null)
            return;
            
        Transform objectsContainer = null;
        
        // Find the Objects container created by RoomLoader
        if (roomLoader.roomContainer != null)
        {
            foreach (Transform child in roomLoader.roomContainer)
            {
                if (child.name == "Objects")
                {
                    objectsContainer = child;
                    break;
                }
            }
        }
        
        if (objectsContainer == null)
        {
            Debug.LogWarning("Objects container not found in room");
            return;
        }
        
        // Create background audio source on this object if needed
        AudioSource backgroundSource = null;
        
        foreach (SoundMapping mapping in soundMappings.soundMappings)
        {
            // Handle background audio separately
            if (mapping.type.ToLower() == "background")
            {
                // Create or get audio source for background
                backgroundSource = GetComponent<AudioSource>();
                if (backgroundSource == null)
                {
                    backgroundSource = gameObject.AddComponent<AudioSource>();
                }
                
                // Configure background audio
                backgroundSource.loop = mapping.loop;
                backgroundSource.volume = mapping.volume * globalVolume;
                backgroundSource.spatialBlend = 0f; // Keep background as 2D sound
                backgroundSource.playOnAwake = true;
                
                // Load and play background audio
                StartCoroutine(LoadAndAssignAudioClip(backgroundSource, mapping.filename, true));
                
                Debug.Log($"Background sound assigned: {mapping.title}");
                continue;
            }
            
            // Handle interaction sounds - find matching object
            Transform targetObject = FindObjectByName(objectsContainer, mapping.objectName);
            
            if (targetObject != null)
            {
                Debug.Log($"Found object for sound: {targetObject.name}");
                
                // Add audio source to the object
                AudioSource audioSource = targetObject.gameObject.AddComponent<AudioSource>();
                audioSource.playOnAwake = false;
                audioSource.loop = mapping.loop;
                audioSource.volume = mapping.volume * globalVolume;
                audioSource.spatialBlend = spatialBlend;
                audioSource.rolloffMode = AudioRolloffMode.Linear;
                audioSource.maxDistance = maxDistance;
                
                // Load the audio clip
                StartCoroutine(LoadAndAssignAudioClip(audioSource, mapping.filename, false));
                
                // Add the audio source to our dictionary
                objectAudioSources[mapping.objectName] = audioSource;
                
                // Add interaction component if enabled
                if (enableInteraction)
                {
                    SoundInteraction interaction = targetObject.gameObject.AddComponent<SoundInteraction>();
                    interaction.audioSource = audioSource;
                }
                
                Debug.Log($"Sound assigned to {targetObject.name}: {mapping.title}");
            }
            else
            {
                Debug.LogWarning($"Could not find object named '{mapping.objectName}' for sound '{mapping.title}'");
            }
        }
    }
    
    Transform FindObjectByName(Transform parent, string objectName)
    {
        // First try exact match
        foreach (Transform child in parent)
        {
            if (child.name.Equals(objectName, StringComparison.OrdinalIgnoreCase))
            {
                return child;
            }
        }
        
        // Then try contains match
        foreach (Transform child in parent)
        {
            if (child.name.Contains(objectName, StringComparison.OrdinalIgnoreCase))
            {
                return child;
            }
        }
        
        // Finally, try the other way around (objectName name might contain the shape name)
        foreach (Transform child in parent)
        {
            if (objectName.Contains(child.name, StringComparison.OrdinalIgnoreCase))
            {
                return child;
            }
        }
        
        return null;
    }
    
    IEnumerator LoadAndAssignAudioClip(AudioSource audioSource, string filename, bool playWhenLoaded)
    {
        string filePath = Path.Combine(Application.streamingAssetsPath, soundsFolderPath, filename);
        
        // If file doesn't exist, look in subfolders
        if (!File.Exists(filePath))
        {
            string soundsPath = Path.Combine(Application.streamingAssetsPath, soundsFolderPath);
            
            if (Directory.Exists(soundsPath))
            {
                string[] directories = Directory.GetDirectories(soundsPath);
                bool found = false;
                
                foreach (string dir in directories)
                {
                    string subFilePath = Path.Combine(dir, filename);
                    if (File.Exists(subFilePath))
                    {
                        filePath = subFilePath;
                        found = true;
                        break;
                    }
                }
                
                if (!found)
                {
                    Debug.LogError($"Sound file not found: {filename}");
                    yield break;
                }
            }
            else
            {
                Debug.LogError($"Sounds directory not found: {soundsPath}");
                yield break;
            }
        }
        
        string audioFileExtension = Path.GetExtension(filePath).ToLower();
        if (audioFileExtension == ".mp3" || audioFileExtension == ".ogg" || audioFileExtension == ".wav")
        {
            using (UnityEngine.Networking.UnityWebRequest www = UnityEngine.Networking.UnityWebRequestMultimedia.GetAudioClip(
                "file://" + filePath, GetAudioType(audioFileExtension)))
            {
                yield return www.SendWebRequest();
                
                if (www.result == UnityEngine.Networking.UnityWebRequest.Result.Success)
                {
                    AudioClip clip = UnityEngine.Networking.DownloadHandlerAudioClip.GetContent(www);
                    clip.name = Path.GetFileNameWithoutExtension(filename);
                    audioSource.clip = clip;
                    
                    if (playWhenLoaded)
                    {
                        audioSource.Play();
                    }
                    
                    Debug.Log($"Successfully loaded audio: {filename}");
                }
                else
                {
                    Debug.LogError($"Error loading audio clip {filename}: {www.error}");
                }
            }
        }
        else
        {
            Debug.LogError($"Unsupported audio format: {audioFileExtension}");
        }
    }
    
    AudioType GetAudioType(string extension)
    {
        switch (extension)
        {
            case ".mp3": 
                return AudioType.MPEG;
            case ".ogg": 
                return AudioType.OGGVORBIS;
            case ".wav": 
                return AudioType.WAV;
            default: 
                return AudioType.UNKNOWN;
        }
    }
    
    public void PlayAllSounds()
    {
        foreach (var source in objectAudioSources.Values)
        {
            if (source != null && !source.isPlaying)
            {
                source.Play();
            }
        }
    }
    
    public void PlaySoundForObject(string objectName)
    {
        if (objectAudioSources.TryGetValue(objectName, out AudioSource source))
        {
            if (source != null && !source.isPlaying)
            {
                source.Play();
            }
        }
    }
}

// Add a simple interaction component
public class SoundInteraction : MonoBehaviour
{
    [HideInInspector]
    public AudioSource audioSource;
    private bool isMouseOver = false;
    
    void OnMouseEnter()
    {
        isMouseOver = true;
    }
    
    void OnMouseExit()
    {
        isMouseOver = false;
    }
    
    void Update()
    {
        if (isMouseOver && Input.GetMouseButtonDown(0) && audioSource != null)
        {
            audioSource.Play();
        }
    }
}