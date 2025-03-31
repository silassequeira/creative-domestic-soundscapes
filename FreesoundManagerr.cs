using System.Collections;
using UnityEngine;
using UnityEngine.Networking;
using System.Text;
using System.Text.RegularExpressions;

public class FreesoundManager : MonoBehaviour
{
    [SerializeField] private string apiServerUrl = "http://localhost:3000";
    [SerializeField] private AudioSource audioSource;

    public IEnumerator GetAndPlaySound(string soundId)
    {
        // Get the download URL
        UnityWebRequest urlRequest = UnityWebRequest.Get($"{apiServerUrl}/api/sounds/{soundId}/download");
        yield return urlRequest.SendWebRequest();

        if (urlRequest.result != UnityWebRequest.Result.Success)
        {
            Debug.LogError($"Error getting download URL: {urlRequest.error}");
            yield break;
        }

        // Parse the response
        string json = urlRequest.downloadHandler.text;
        string downloadUrl = Regex.Match(json, "\"download_url\":\"([^\"]+)\"").Groups[1].Value;
        downloadUrl = downloadUrl.Replace("\\/", "/");

        // Download the actual audio file
        UnityWebRequest audioRequest = UnityWebRequestMultimedia.GetAudioClip(downloadUrl, AudioType.WAV);
        yield return audioRequest.SendWebRequest();

        if (audioRequest.result != UnityWebRequest.Result.Success)
        {
            Debug.LogError($"Error downloading audio: {audioRequest.error}");
            yield break;
        }

        // Play the audio
        AudioClip clip = DownloadHandlerAudioClip.GetContent(audioRequest);
        audioSource.clip = clip;
        audioSource.Play();
    }
}