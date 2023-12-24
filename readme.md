Parameters:
#1 - path to the project
#2 - folder of the service inside the project directory
#3 - port for local proxy API server
#4 - name of dotenv defined in the service
#5 - any string indicates that should be run under nodemon process
#6 - any string indicates that should be swagger re-generated

E.g.:
Run "BE-episodes" service that located in "D:\dev\_Projects\AnyPodcast\" on port "4062" with "dev" env profile:
    run_server.bat D:\dev\_Projects\AnyPodcast\ BE-episodes 4062 dev
Run "BE-episodes" service that located in "D:\dev\_Projects\AnyPodcast\" on port "4062" with "dev" env profile running under "nodemon" and with swagger re-generation:
    run_server.bat D:\dev\_Projects\AnyPodcast\ BE-episodes 4062 dev nodemon swagger