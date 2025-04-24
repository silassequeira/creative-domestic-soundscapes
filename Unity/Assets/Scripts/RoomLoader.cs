using System.IO;
using UnityEngine;

public class RoomLoader : MonoBehaviour
{
    public string jsonFileName = "room.json"; // Certifica-te que está em Assets/StreamingAssets

    void Start()
    {
        LoadRoom();
    }

    void LoadRoom()
    {
        string filePath = Path.Combine(Application.streamingAssetsPath, jsonFileName);

        if (!File.Exists(filePath))
        {
            Debug.LogError("Ficheiro JSON não encontrado em: " + filePath);
            return;
        }

        string jsonContent = File.ReadAllText(filePath);
        RoomData roomData = JsonUtility.FromJson<RoomData>(jsonContent);

        // Criar paredes
        foreach (WallData wall in roomData.environment.walls)
        {
            GameObject newWall = GameObject.CreatePrimitive(PrimitiveType.Cube);
            newWall.name = wall.id;

            newWall.transform.position = new Vector3(wall.position[0], wall.position[1], wall.position[2]);
            newWall.transform.eulerAngles = new Vector3(wall.rotation[0], wall.rotation[1], wall.rotation[2]);
            newWall.transform.localScale = new Vector3(wall.width, wall.height, wall.depth);

            newWall.GetComponent<Renderer>().material.color = Color.gray;
        }

        // Criar chão
        FloorData floor = roomData.environment.floor;
        GameObject newFloor = GameObject.CreatePrimitive(PrimitiveType.Cube);
        newFloor.name = floor.id;

        newFloor.transform.position = new Vector3(floor.position[0], floor.position[1], floor.position[2]);
        newFloor.transform.eulerAngles = new Vector3(floor.rotation[0], floor.rotation[1], floor.rotation[2]);
        newFloor.transform.localScale = new Vector3(floor.width, floor.height, floor.depth);

        newFloor.GetComponent<Renderer>().material.color = Color.green;
    }
}
